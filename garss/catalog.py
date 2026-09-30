import html
import re
from collections import Counter
from hashlib import sha256
from urllib.parse import urlsplit

from garss.models import FeedSource, SourceTemplate

SUBSCRIPTION_RE = re.compile(r"\[订阅地址\]\(([^)]+)\)")
SPAN_ID_RE = re.compile(r"<span>([^<]+)</span>")
TAG_RE = re.compile(r"<[^>]+>")


def safe_http_url(value: str) -> str:
    value = value.strip()
    parsed = urlsplit(value)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
        raise ValueError(f"unsupported URL: {value!r}")
    if any(ord(character) < 32 for character in value):
        raise ValueError("URL contains control characters")
    return value


def _source_id(cell: str) -> str:
    match = SPAN_ID_RE.search(cell)
    value = match.group(1) if match else TAG_RE.sub("", cell)
    value = html.unescape(value).strip()
    if not value:
        raise ValueError("feed source is missing an id")
    return value


def parse_source_templates(content: str) -> list[SourceTemplate]:
    rows = []
    for line_number, line in enumerate(content.splitlines(), start=1):
        if "{{latest_content}}" not in line:
            continue
        cells = line.split("|")
        subscription = SUBSCRIPTION_RE.search(line)
        if len(cells) != 7 or not subscription:
            raise ValueError(f"invalid feed row at line {line_number}")
        rows.append(
            (
                _source_id(cells[1]),
                cells[2].strip(),
                cells[3].strip(),
                safe_http_url(subscription.group(1)),
                line,
            )
        )
    if not rows:
        raise ValueError("no feed sources found in template")

    id_counts = Counter(row[0] for row in rows)
    templates = []
    for raw_id, title, description, feed_url, line in rows:
        # The historical catalogue contains a few duplicate display IDs. Keep
        # those IDs in the rendered table, while exposing stable unique IDs to
        # the generated API and future clients.
        source_id = raw_id
        if id_counts[raw_id] > 1:
            suffix = sha256(feed_url.encode("utf-8")).hexdigest()[:8]
            source_id = f"{raw_id}-{suffix}"
        source = FeedSource(
            id=source_id,
            title=title,
            description=description,
            feed_url=feed_url,
        )
        templates.append(SourceTemplate(source=source, row=line))
    return templates
