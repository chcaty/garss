import logging
import time
from datetime import datetime, timezone

import feedparser
import requests

from garss.catalog import safe_http_url
from garss.models import Article, FeedResult, FeedSource
from garss.timezones import app_date
from retention import entry_published_datetime, retention_cutoff

LOGGER = logging.getLogger(__name__)
MAX_FEED_BYTES = 5 * 1024 * 1024
REQUEST_HEADERS = {
    "User-Agent": "garss/2.0 (+https://github.com/chcaty/garss)",
    "Accept": "application/atom+xml, application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
}


def _download_feed(url: str, timeout: int, request_get=requests.get) -> bytes:
    response = request_get(
        url,
        headers=REQUEST_HEADERS,
        timeout=(5, timeout),
        stream=True,
    )
    try:
        response.raise_for_status()
        content_length = response.headers.get("Content-Length")
        if content_length and int(content_length) > MAX_FEED_BYTES:
            raise ValueError("feed exceeds the 5 MiB size limit")
        chunks = []
        size = 0
        for chunk in response.iter_content(chunk_size=64 * 1024):
            if not chunk:
                continue
            size += len(chunk)
            if size > MAX_FEED_BYTES:
                raise ValueError("feed exceeds the 5 MiB size limit")
            chunks.append(chunk)
        return b"".join(chunks)
    finally:
        response.close()


def _parse_articles(
    source: FeedSource,
    payload: bytes,
    today=None,
    retention_days: int = 30,
    only_date=None,
) -> list[Article]:
    feed = feedparser.parse(payload)
    entries = feed.get("entries", [])
    if feed.get("bozo") and not entries:
        raise ValueError(f"invalid feed: {feed.get('bozo_exception')}")

    if today is None:
        today = datetime.now(timezone.utc).date()
    cutoff = retention_cutoff(today=today, retention_days=retention_days)
    articles = []
    seen_urls = set()
    for entry in entries:
        published_at = entry_published_datetime(entry)
        if published_at is None:
            continue
        published_date = app_date(published_at)
        if only_date is not None and published_date != only_date:
            continue
        if only_date is None and (published_date < cutoff or published_date > today):
            continue
        title = (
            str(entry.get("title", "")).replace("\r", " ").replace("\n", " ").strip()
        )
        try:
            url = safe_http_url(str(entry.get("link", "")))
        except ValueError:
            continue
        if not title or url in seen_urls:
            continue
        seen_urls.add(url)
        articles.append(
            Article(
                source_id=source.id,
                title=title,
                url=url,
                published_at=published_at,
            )
        )
    articles.sort(key=lambda article: article.published_at, reverse=True)
    return articles


def fetch_feed(
    source: FeedSource,
    today=None,
    retention_days: int = 30,
    attempts: int = 3,
    only_date=None,
    request_get=requests.get,
    sleep=time.sleep,
) -> FeedResult:
    last_error = None
    for attempt in range(attempts):
        try:
            payload = _download_feed(
                source.feed_url,
                timeout=8 * (attempt + 1),
                request_get=request_get,
            )
            articles = _parse_articles(
                source,
                payload,
                today=today,
                retention_days=retention_days,
                only_date=only_date,
            )
            LOGGER.info("Fetched %s: %d recent article(s)", source.id, len(articles))
            return FeedResult(source=source, articles=articles)
        except (requests.RequestException, ValueError, TypeError) as error:
            last_error = error
            LOGGER.warning(
                "Fetch failed for %s (%d/%d): %s",
                source.id,
                attempt + 1,
                attempts,
                error,
            )
            if attempt + 1 < attempts:
                sleep(2**attempt)
    return FeedResult(source=source, error=str(last_error or "unknown fetch error"))
