import json
import os
import re
import shutil
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import format_datetime
from pathlib import Path
from hashlib import sha256

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
    feeds_payload = {
        "api_version": API_VERSION, "generated_at": generated,
        "feeds": [{**result.source.as_dict(), "status": result.status,
                   "article_count": len(result.articles)} for result in results],
    }
    articles_payload = {
        "api_version": API_VERSION, "generated_at": generated,
        "articles": [article.as_dict() for article in articles],
    }
    snapshot_id = sha256(json.dumps(
        [feeds_payload, articles_payload], ensure_ascii=False, sort_keys=True,
    ).encode("utf-8")).hexdigest()[:20]
    snapshot_root = version_root / "snapshots" / snapshot_id
    write_json(snapshot_root / "feeds.json", feeds_payload)
    write_json(snapshot_root / "articles.json", articles_payload)
    files = {}
    for name in ("feeds.json", "articles.json"):
        content = (snapshot_root / name).read_bytes()
        files[name] = {"sha256": sha256(content).hexdigest(), "bytes": len(content)}
    write_json(snapshot_root / "manifest.json", {
        "api_version": API_VERSION, "snapshot_id": snapshot_id,
        "generated_at": generated, "files": files,
        "feeds_endpoint": "./feeds.json", "articles_endpoint": "./articles.json",
    })
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
            "snapshot_id": snapshot_id,
            "snapshot_endpoint": f"./snapshots/{snapshot_id}/manifest.json",
        },
    )
    write_json(version_root / "feeds.json", feeds_payload)
    write_json(version_root / "articles.json", articles_payload)


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
    shutil.copytree(source, destination, dirs_exist_ok=True)


def publish_generated_files(staging: Path, destination: Path):
    """Publish validated outputs with the App snapshot pointer written last."""
    files = sorted(path for path in staging.rglob("*") if path.is_file())
    meta = Path("docs/api/v1/meta.json")
    files.sort(key=lambda path: path.relative_to(staging) == meta)
    for source in files:
        target = destination / source.relative_to(staging)
        target.parent.mkdir(parents=True, exist_ok=True)
        os.replace(source, target)


def prune_snapshots(version_root: Path, keep: int = 8):
    """Bound generated history without touching user files or other directories."""
    snapshot_directory = version_root / "snapshots"
    if snapshot_directory.is_symlink():
        raise ValueError("snapshot cleanup root must not be a symbolic link")
    snapshot_root = snapshot_directory.resolve()
    if not snapshot_root.is_dir():
        return
    current_meta = json.loads((version_root / "meta.json").read_text(encoding="utf-8"))
    current = current_meta["snapshot_id"]
    snapshots = [path for path in snapshot_root.iterdir()
                 if path.is_dir() and not path.is_symlink()
                 and re.fullmatch(r"[0-9a-f]{20}", path.name)
                 and (path / "manifest.json").is_file()]
    snapshots.sort(key=lambda path: (path.name == current, path.stat().st_mtime_ns), reverse=True)
    for path in snapshots[max(1, keep):]:
        resolved = path.resolve()
        if resolved.parent != snapshot_root:
            raise ValueError("snapshot cleanup target is outside the generated directory")
        shutil.rmtree(resolved)
