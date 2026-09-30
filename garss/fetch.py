import logging
import time
from datetime import datetime, timezone

import feedparser
import requests

from garss.catalog import safe_http_url
from garss.feed_cache import CachedFeed, safe_validator
from garss.models import Article, FeedResult, FeedSource
from garss.timezones import app_date
from retention import entry_published_datetime, retention_cutoff

LOGGER = logging.getLogger(__name__)
MAX_FEED_BYTES = 5 * 1024 * 1024
REQUEST_HEADERS = {
    "User-Agent": "garss/2.0 (+https://github.com/chcaty/garss)",
    "Accept": "application/atom+xml, application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
}


def _download_feed(url: str, timeout: int, request_get=requests.get, *, cached=None, metadata=None, deadline=None, clock=time.monotonic) -> bytes:
    headers = dict(REQUEST_HEADERS)
    if cached is not None:
        if cached.etag:
            headers["If-None-Match"] = cached.etag
        if cached.last_modified:
            headers["If-Modified-Since"] = cached.last_modified
    remaining = deadline - clock() if deadline is not None else timeout
    if remaining <= 0:
        raise requests.Timeout("feed retry budget exceeded")
    response = request_get(
        url,
        headers=headers,
        timeout=(min(5, remaining), min(timeout, remaining)),
        stream=True,
    )
    try:
        response.raise_for_status()
        if metadata is not None:
            metadata.update(etag=safe_validator(response.headers.get("ETag")),
                            last_modified=safe_validator(response.headers.get("Last-Modified")))
        if getattr(response, "status_code", 200) == 304:
            if cached is None:
                raise requests.RequestException("304 response without a cached body")
            if metadata is not None:
                metadata["etag"] = metadata["etag"] or cached.etag
                metadata["last_modified"] = metadata["last_modified"] or cached.last_modified
            return cached.payload
        content_length = response.headers.get("Content-Length")
        if content_length and int(content_length) > MAX_FEED_BYTES:
            raise ValueError("feed exceeds the 5 MiB size limit")
        chunks = []
        size = 0
        for chunk in response.iter_content(chunk_size=64 * 1024):
            if deadline is not None and clock() >= deadline:
                raise requests.Timeout("feed download budget exceeded")
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
    cache=None,
    budget_seconds: float = 45,
    clock=time.monotonic,
) -> FeedResult:
    cached = cache.get(source.feed_url) if cache is not None else None
    deadline = clock() + budget_seconds
    last_error = None
    for attempt in range(attempts):
        if clock() >= deadline:
            last_error = requests.Timeout("feed retry budget exceeded")
            break
        try:
            metadata = {}
            payload = _download_feed(
                source.feed_url,
                timeout=8,
                request_get=request_get,
                cached=cached, metadata=metadata, deadline=deadline, clock=clock,
            )
            articles = _parse_articles(
                source,
                payload,
                today=today,
                retention_days=retention_days,
                only_date=only_date,
            )
            if cache is not None:
                cache.put(source.feed_url, CachedFeed(payload, **metadata))
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
            status = getattr(getattr(error, "response", None), "status_code", None)
            if isinstance(error, (ValueError, TypeError)) or (
                status is not None and 400 <= status < 500 and status not in {408, 429}
            ):
                break
            if attempt + 1 < attempts:
                delay = 2**attempt
                if clock() + delay >= deadline:
                    break
                sleep(delay)
    return FeedResult(source=source, error=str(last_error or "unknown fetch error"))
