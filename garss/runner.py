"""Feed collection, atomic publication and optional notifications."""
import logging
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from garss.catalog import load_source_templates
from garss.feed_cache import FeedCache
from garss.history import load_cached_articles, merge_recent_history, enrich_cached_articles
from garss.output import (
    atomic_write_text,
    sync_media,
    write_legacy_catalog,
    write_opml,
    write_static_api,
    publish_generated_files,
    prune_snapshots,
)
from garss.render import build_readme
from garss.fetch_pool import fetch_all
from garss.notifications import notify_email
from garss.timezones import APP_TIMEZONE
from retention import DEFAULT_RETENTION_DAYS

LOGGER = logging.getLogger(__name__)
PROJECT_ROOT = Path(__file__).resolve().parents[1]


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
    cached_articles = enrich_cached_articles(cached_articles, sources, response_cache, fetch_date, retention_days)
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


