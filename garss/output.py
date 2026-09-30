import json
import os
import shutil
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import format_datetime
from pathlib import Path

from garss import API_VERSION
from garss.models import FeedResult, FeedSource


def atomic_write_text(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(content, encoding="utf-8", newline="\n")
    os.replace(temporary, path)


def write_json(path: Path, payload):
    atomic_write_text(
        path,
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
    )


def write_legacy_catalog(path: Path, sources: list[FeedSource]):
    write_json(
        path,
        {
            "garssInfo": [
                {
                    "description": source.description,
                    "title": source.title,
                    "xmlUrl": source.feed_url,
                }
                for source in sources
            ]
        },
    )


def write_static_api(
    docs_directory: Path,
    results: list[FeedResult],
    generated_at: datetime,
    retention_days: int,
):
    api_root = docs_directory / "api"
    version_root = api_root / "v1"
    generated = generated_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    articles = sorted(
        (article for result in results for article in result.articles),
        key=lambda article: article.published_at,
        reverse=True,
    )
    write_json(
        api_root / "index.json",
        {
            "current_version": "v1",
            "versions": {"v1": "./v1/meta.json"},
        },
    )
    write_json(
        version_root / "meta.json",
        {
            "api_version": API_VERSION,
            "generated_at": generated,
            "retention_days": retention_days,
            "feeds_endpoint": "./feeds.json",
            "articles_endpoint": "./articles.json",
            "feed_candidates_endpoint": "./feed-candidates.json",
            "rsshub_routes_endpoint": "./rsshub-routes.json",
            "review_schema_endpoint": "./review-schema.json",
        },
    )
    write_json(
        version_root / "feeds.json",
        {
            "api_version": API_VERSION,
            "generated_at": generated,
            "feeds": [
                {
                    **result.source.as_dict(),
                    "status": result.status,
                    "article_count": len(result.articles),
                }
                for result in results
            ],
        },
    )
    write_json(
        version_root / "articles.json",
        {
            "api_version": API_VERSION,
            "generated_at": generated,
            "articles": [article.as_dict() for article in articles],
        },
    )


def write_opml(
    path: Path, sources: list[FeedSource], version: str, generated_at: datetime
):
    root = ET.Element("opml", {"version": version})
    head = ET.SubElement(root, "head")
    ET.SubElement(head, "title").text = "嘎!RSS"
    if version == "2.0":
        utc_time = generated_at.astimezone(timezone.utc)
        ET.SubElement(head, "dateCreated").text = format_datetime(utc_time, usegmt=True)
        ET.SubElement(head, "dateModified").text = format_datetime(
            utc_time, usegmt=True
        )
        ET.SubElement(head, "ownerName").text = "GARSS"
    body = ET.SubElement(root, "body")
    for source in sources:
        attributes = {
            "text": source.title,
            "title": source.title,
            "type": "rss",
            "xmlUrl": source.feed_url,
            "htmlUrl": source.feed_url,
        }
        if version == "2.0":
            attributes["description"] = source.description
            attributes["language"] = "unknown"
            attributes["version"] = "RSS2"
        ET.SubElement(body, "outline", attributes)
    ET.indent(root, space="  ")
    xml = ET.tostring(root, encoding="unicode", xml_declaration=True)
    atomic_write_text(path, xml + "\n")


def sync_media(source: Path, destination: Path):
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(source, destination)
