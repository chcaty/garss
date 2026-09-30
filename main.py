import argparse
import json
import logging
import os
import tempfile
import threading
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

from garss.catalog import load_source_templates
from garss.fetch import fetch_feed
from garss.feed_cache import FeedCache
from garss.history import load_cached_articles, merge_recent_history
from garss.models import FeedResult
from garss.output import (
    atomic_write_text,
    sync_media,
    write_legacy_catalog,
    write_opml,
    write_static_api,
    publish_generated_files,
    prune_snapshots,
)
from garss.render import MAIL_CONTENT_RE, build_readme
from garss.timezones import APP_TIMEZONE
from retention import DEFAULT_RETENTION_DAYS

LOGGER = logging.getLogger(__name__)
PROJECT_ROOT = Path(__file__).resolve().parent


def fetch_all(sources, fetch_date, workers: int, cache=None) -> list[FeedResult]:
    if workers < 1:
        raise ValueError("workers must be at least 1")
    if not sources:
        return []
    local = threading.local()
    sessions = []
    session_lock = threading.Lock()

    def fetch_one(source):
        if not hasattr(local, "session"):
            local.session = requests.Session()
            with session_lock:
                sessions.append(local.session)
        # Reuse connections, not cookies received from unrelated feeds.
        local.session.cookies.clear()
        return fetch_feed(source, today=fetch_date, only_date=fetch_date,
                          request_get=local.session.get, cache=cache)

    results_by_id = {}
    try:
        return _collect_feeds(sources, workers, fetch_one, results_by_id)
    finally:
        for session in sessions:
            session.close()


def _collect_feeds(sources, workers, fetch_one, results_by_id):
    with ThreadPoolExecutor(max_workers=min(workers, len(sources))) as executor:
        futures = {
            executor.submit(
                fetch_one,
                source,
            ): source
            for source in sources
        }
        for completed, future in enumerate(as_completed(futures), start=1):
            source = futures[future]
            try:
                result = future.result()
            except (
                Exception
            ) as error:  # Keep one broken source from aborting all feeds.
                LOGGER.exception("Unexpected fetch failure for %s", source.id)
                result = FeedResult(source=source, error=str(error))
            results_by_id[source.id] = result
            LOGGER.info("Progress: %d/%d", completed, len(sources))
    return [results_by_id[source.id] for source in sources]


def load_recipients(path: Path) -> list[str]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return [task["email"] for task in payload.get("tasks", []) if task.get("email")]


def send_mail(recipients: list[str], subject: str, html_content: str) -> bool:
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    smtp_host = os.getenv("SMTP_HOST")
    if not recipients or not all((smtp_user, smtp_password, smtp_host)):
        LOGGER.info("Email skipped: recipients or SMTP configuration is missing")
        return False
    import yagmail

    with yagmail.Client(
        user=smtp_user,
        password=smtp_password,
        host=smtp_host,
    ) as client:
        client.send(recipients, subject, html_content)
    return True


def notify_email(project_root: Path, html_content: str | None = None, content_path: Path | None = None) -> bool:
    """Treat every notification failure as optional, without logging credentials."""
    if not all(
        os.getenv(name) for name in ("SMTP_USER", "SMTP_PASSWORD", "SMTP_HOST")
    ):
        LOGGER.info("Email skipped: SMTP configuration is missing")
        return False
    try:
        if html_content is None:
            if content_path is not None:
                html_content = content_path.read_text(encoding="utf-8")
            else:
                readme = (project_root / "docs/README.md").read_text(encoding="utf-8")
                match = MAIL_CONTENT_RE.search(readme)
                if not match:
                    raise ValueError("generated page has no email content")
                html_content = match.group(1)
        recipients = load_recipients(project_root / "tasks.json")
        return send_mail(recipients, "嘎!RSS订阅", html_content)
    except Exception as error:
        # Notifications are optional. Do not include SMTP responses or secrets.
        LOGGER.warning(
            "Email notification failed (%s); feed build and deployment are unaffected",
            type(error).__name__,
        )
        return False


def build(
    project_root: Path = PROJECT_ROOT,
    retention_days: int = DEFAULT_RETENTION_DAYS,
    workers: int = 16,
    send_email: bool = True,
):
    generated_at = datetime.now(timezone.utc)
    fetch_date = generated_at.astimezone(APP_TIMEZONE).date()
    template_path = project_root / "EditREADME.md"
    template_content = template_path.read_text(encoding="utf-8")
    source_templates = load_source_templates(project_root / "sources.json")
    sources = [item.source for item in source_templates]
    LOGGER.info("Loaded %d feed source(s)", len(sources))

    response_cache = FeedCache(project_root / ".cache/feed-responses")
    results = fetch_all(sources, fetch_date=fetch_date, workers=workers, cache=response_cache)
    response_cache.prune(source.feed_url for source in sources)
    cached_articles = load_cached_articles(
        project_root / "docs/api/v1/articles.json",
        {source.id for source in sources},
    )
    results = merge_recent_history(
        results,
        cached_articles,
        today=fetch_date,
        retention_days=retention_days,
    )
    readme, email_html = build_readme(
        template_content,
        source_templates,
        results,
        generated_at,
        retention_days,
    )

    with tempfile.TemporaryDirectory(prefix=".garss-build-", dir=project_root) as directory:
        staging = Path(directory)
        docs_directory = staging / "docs"
        atomic_write_text(staging / "README.md", readme)
        atomic_write_text(docs_directory / "README.md", readme)
        atomic_write_text(staging / "build/notification.html", email_html)
        sync_media(project_root / "_media", docs_directory / "_media")
        write_legacy_catalog(staging / "garssInfo.json", sources)
        for version in ("1.0", "2.0"):
            write_opml(
                staging / f"zhaoolee_github_garss_subscription_list_v{version[0]}.opml",
                sources, version, generated_at,
            )
        write_static_api(docs_directory, results, generated_at, retention_days)
        publish_generated_files(staging, project_root)
    prune_snapshots(project_root / "docs/api/v1")

    if send_email:
        notify_email(project_root, email_html)
    return results


def parse_args():
    parser = argparse.ArgumentParser(description="Build GARSS pages and static API")
    parser.add_argument("--retention-days", type=int, default=DEFAULT_RETENTION_DAYS)
    parser.add_argument("--workers", type=int, default=16)
    email_options = parser.add_mutually_exclusive_group()
    email_options.add_argument("--no-email", action="store_true")
    email_options.add_argument(
        "--email-only",
        action="store_true",
        help="Send email from the generated page without fetching feeds",
    )
    parser.add_argument("--email-content", type=Path, help="Generated notification artifact used with --email-only")
    return parser.parse_args()


def main():
    args = parse_args()
    if args.retention_days < 1:
        raise SystemExit("--retention-days must be at least 1")
    if args.workers < 1:
        raise SystemExit("--workers must be at least 1")
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    if args.email_only:
        notify_email(PROJECT_ROOT, content_path=args.email_content)
        return
    build(
        retention_days=args.retention_days,
        workers=args.workers,
        send_email=not args.no_email,
    )


if __name__ == "__main__":
    main()
