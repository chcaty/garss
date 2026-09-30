import argparse
import json
import logging
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import yagmail

from garss.catalog import parse_source_templates
from garss.fetch import fetch_feed
from garss.history import load_cached_articles, merge_recent_history
from garss.models import FeedResult
from garss.output import (
    atomic_write_text,
    sync_media,
    write_legacy_catalog,
    write_opml,
    write_static_api,
)
from garss.render import build_readme
from garss.timezones import APP_TIMEZONE
from retention import DEFAULT_RETENTION_DAYS

LOGGER = logging.getLogger(__name__)
PROJECT_ROOT = Path(__file__).resolve().parent


def fetch_all(sources, fetch_date, workers: int) -> list[FeedResult]:
    results_by_id = {}
    with ThreadPoolExecutor(max_workers=min(workers, len(sources))) as executor:
        futures = {
            executor.submit(
                fetch_feed,
                source,
                today=fetch_date,
                only_date=fetch_date,
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
    with yagmail.Client(
        user=smtp_user,
        password=smtp_password,
        host=smtp_host,
    ) as client:
        client.send(recipients, subject, html_content)
    return True


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
    source_templates = parse_source_templates(template_content)
    sources = [item.source for item in source_templates]
    LOGGER.info("Loaded %d feed source(s)", len(sources))

    results = fetch_all(sources, fetch_date=fetch_date, workers=workers)
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

    docs_directory = project_root / "docs"
    atomic_write_text(project_root / "README.md", readme)
    atomic_write_text(docs_directory / "README.md", readme)
    sync_media(project_root / "_media", docs_directory / "_media")

    write_legacy_catalog(project_root / "garssInfo.json", sources)
    write_opml(
        project_root / "zhaoolee_github_garss_subscription_list_v1.opml",
        sources,
        "1.0",
        generated_at,
    )
    write_opml(
        project_root / "zhaoolee_github_garss_subscription_list_v2.opml",
        sources,
        "2.0",
        generated_at,
    )
    write_static_api(
        docs_directory,
        results,
        generated_at,
        retention_days,
    )

    if send_email:
        recipients = load_recipients(project_root / "tasks.json")
        send_mail(recipients, "嘎!RSS订阅", email_html)
    return results


def parse_args():
    parser = argparse.ArgumentParser(description="Build GARSS pages and static API")
    parser.add_argument("--retention-days", type=int, default=DEFAULT_RETENTION_DAYS)
    parser.add_argument("--workers", type=int, default=16)
    parser.add_argument("--no-email", action="store_true")
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
    build(
        retention_days=args.retention_days,
        workers=args.workers,
        send_email=not args.no_email,
    )


if __name__ == "__main__":
    main()
