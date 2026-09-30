import json
import logging
from datetime import datetime
from pathlib import Path

from garss.catalog import safe_http_url
from garss.models import Article, FeedResult
from garss.timezones import app_date
from retention import retention_cutoff

LOGGER = logging.getLogger(__name__)


def load_cached_articles(path: Path, source_ids: set[str]) -> list[Article]:
    """Load previously generated articles, ignoring malformed cache entries."""
    if not path.exists():
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        LOGGER.warning("Article cache ignored: %s", error)
        return []

    articles = []
    if not isinstance(payload, dict) or not isinstance(payload.get("articles"), list):
        LOGGER.warning("Article cache ignored: invalid document structure")
        return articles
    for item in payload.get("articles", []):
        try:
            source_id = str(item["source_id"])
            if source_id not in source_ids:
                continue
            published_at = datetime.fromisoformat(
                str(item["published_at"]).replace("Z", "+00:00")
            )
            if published_at.tzinfo is None:
                continue
            articles.append(
                Article(
                    source_id=source_id,
                    title=str(item["title"]),
                    url=safe_http_url(str(item["url"])),
                    published_at=published_at,
                )
            )
        except (KeyError, TypeError, ValueError):
            continue
    return articles


def merge_recent_history(
    results: list[FeedResult],
    cached_articles: list[Article],
    today,
    retention_days: int,
) -> list[FeedResult]:
    """Merge today's fetch with cached history and enforce the rolling window."""
    cutoff = retention_cutoff(today=today, retention_days=retention_days)
    articles_by_source = {
        result.source.id: {article.id: article for article in result.articles}
        for result in results
    }
    for article in cached_articles:
        published_date = app_date(article.published_at)
        if article.source_id in articles_by_source and cutoff <= published_date <= today:
            articles_by_source[article.source_id].setdefault(article.id, article)

    for result in results:
        result.articles = sorted(
            articles_by_source[result.source.id].values(),
            key=lambda article: article.published_at,
            reverse=True,
        )
    return results
