import io
import json
import re
import xml.etree.ElementTree as ET
import zipfile
from collections.abc import Iterable
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit, urlunsplit

import requests

from garss import API_VERSION
from garss.catalog import parse_source_templates, safe_http_url
from garss.output import write_json

MAX_CATALOG_BYTES = 25 * 1024 * 1024
MAX_ARCHIVE_BYTES = 50 * 1024 * 1024
MAX_ARCHIVE_FILES = 500
REQUEST_HEADERS = {
    "User-Agent": "garss-source-sync/1.0 (+https://github.com/chcaty/garss)",
    "Accept": "application/json, application/xml, text/xml, application/zip, */*;q=0.1",
}


def _generated_timestamp(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def canonical_feed_key(value: str) -> str:
    """Return a conservative comparison key without changing the published URL."""
    parsed = urlsplit(safe_http_url(value))
    hostname = (parsed.hostname or "").lower()
    port = parsed.port
    if port and not (
        (parsed.scheme.lower() == "http" and port == 80)
        or (parsed.scheme.lower() == "https" and port == 443)
    ):
        hostname = f"{hostname}:{port}"
    path = re.sub(r"/{2,}", "/", parsed.path or "/").rstrip("/") or "/"
    # HTTP and HTTPS variants normally identify the same public feed. Prefer
    # HTTPS when merging, but do not rewrite a URL that has only an HTTP form.
    return urlunsplit(("", hostname, path, parsed.query, ""))


def _candidate_id(feed_url: str) -> str:
    return sha256(canonical_feed_key(feed_url).encode()).hexdigest()[:20]


def _clean_text(value, fallback: str = "") -> str:
    return re.sub(r"\s+", " ", str(value or fallback)).strip()


def _candidate(
    *,
    title: str,
    feed_url: str,
    source: str,
    site_url: str = "",
    description: str = "",
    categories: Iterable[str] = (),
    language: str = "",
    packs: Iterable[str] = (),
    generated: bool = False,
):
    feed_url = safe_http_url(feed_url)
    if site_url:
        try:
            site_url = safe_http_url(site_url)
        except ValueError:
            site_url = ""
    title = _clean_text(title, urlsplit(feed_url).hostname or feed_url)
    return {
        "id": _candidate_id(feed_url),
        "title": title,
        "feed_url": feed_url,
        "site_url": site_url,
        "description": _clean_text(description),
        "categories": sorted({_clean_text(item) for item in categories if item}),
        "language": _clean_text(language),
        "packs": sorted({_clean_text(item) for item in packs if item}),
        "sources": [source],
        "generated": generated,
        "review_required": True,
    }


def parse_tidings(payload: bytes, catalog: dict) -> list[dict]:
    document = json.loads(payload)
    if not isinstance(document, dict):
        raise TypeError("Tidings catalog must be an object")
    allowed_kinds = set(catalog.get("kinds", []))
    candidates = []
    for item in document.get("feeds", []):
        if allowed_kinds and item.get("kind") not in allowed_kinds:
            continue
        try:
            candidates.append(
                _candidate(
                    title=item.get("title", ""),
                    feed_url=item["feed_url"],
                    site_url=item.get("site_url", ""),
                    description=item.get("description", ""),
                    categories=[item.get("category", "")],
                    language=item.get("language", ""),
                    packs=item.get("packs", []),
                    source=catalog["id"],
                )
            )
        except (KeyError, TypeError, ValueError):
            continue
    return candidates


def _safe_xml_root(payload: bytes):
    if len(payload) > MAX_CATALOG_BYTES:
        raise ValueError("OPML catalog exceeds the size limit")
    upper = payload[:4096].upper()
    if b"<!DOCTYPE" in upper or b"<!ENTITY" in upper:
        raise ValueError("OPML catalog contains a forbidden document type")
    return ET.fromstring(payload)


def parse_opml(
    payload: bytes,
    catalog_id: str,
    fallback_category: str = "",
) -> list[dict]:
    root = _safe_xml_root(payload)
    candidates = []

    def visit(element, parents: tuple[str, ...]):
        xml_url = element.attrib.get("xmlUrl") or element.attrib.get("xmlurl")
        title = element.attrib.get("title") or element.attrib.get("text") or ""
        children = list(element)
        categories = parents
        if not xml_url and title and children:
            categories = (*parents, _clean_text(title))
        if xml_url:
            combined_categories = (*parents, fallback_category)
            try:
                candidates.append(
                    _candidate(
                        title=title,
                        feed_url=xml_url,
                        site_url=element.attrib.get("htmlUrl", ""),
                        description=element.attrib.get("description", ""),
                        categories=combined_categories,
                        source=catalog_id,
                    )
                )
            except ValueError:
                pass
        for child in children:
            visit(child, categories)

    visit(root, ())
    return candidates


def parse_opml_zip(payload: bytes, catalog: dict) -> list[dict]:
    if len(payload) > MAX_CATALOG_BYTES:
        raise ValueError("catalog archive exceeds the download size limit")
    candidates = []
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        members = [
            item
            for item in archive.infolist()
            if item.filename.lower().endswith(".opml")
            and catalog.get("path_contains", "") in item.filename
        ]
        if len(members) > MAX_ARCHIVE_FILES:
            raise ValueError("catalog archive contains too many OPML files")
        if sum(item.file_size for item in members) > MAX_ARCHIVE_BYTES:
            raise ValueError("catalog archive expands beyond the size limit")
        for member in members:
            category = PurePosixPath(member.filename).stem
            candidates.extend(
                parse_opml(
                    archive.read(member),
                    catalog_id=catalog["id"],
                    fallback_category=category,
                )
            )
    return candidates


def parse_rsshub(payload: bytes, catalog: dict) -> tuple[list[dict], list[dict]]:
    document = json.loads(payload)
    if not isinstance(document, dict):
        raise TypeError("RSSHub route registry must be an object")
    instance = catalog.get("instance", "https://rsshub.app").rstrip("/")
    candidates = []
    routes = []
    for namespace_id, namespace in document.items():
        if not isinstance(namespace, dict):
            continue
        namespace_categories = namespace.get("categories") or []
        namespace_routes = namespace.get("routes") or {}
        if not isinstance(namespace_routes, dict):
            continue
        for route_path, route in namespace_routes.items():
            if not isinstance(route, dict):
                continue
            example = route.get("example", "")
            route_categories = route.get("categories") or []
            features = route.get("features") or {}
            routes.append(
                {
                    "id": sha256(route_path.encode()).hexdigest()[:20],
                    "namespace": namespace_id,
                    "namespace_name": _clean_text(namespace.get("name", "")),
                    "name": _clean_text(route.get("name", "")),
                    "path": route_path,
                    "example": example,
                    "example_url": f"{instance}{example}" if example else "",
                    "site": _clean_text(route.get("url") or namespace.get("url", "")),
                    "categories": sorted(
                        set(namespace_categories) | set(route_categories)
                    ),
                    "requires_config": bool(features.get("requireConfig")),
                    "supports_radar": bool(features.get("supportRadar")),
                }
            )
            for top_feed in route.get("topFeeds") or []:
                if not isinstance(top_feed, dict):
                    continue
                rsshub_url = str(top_feed.get("url", ""))
                if not rsshub_url.startswith("rsshub://") or top_feed.get(
                    "errorMessage"
                ):
                    continue
                try:
                    candidates.append(
                        _candidate(
                            title=top_feed.get("title") or route.get("name", ""),
                            feed_url=f"{instance}/{rsshub_url.removeprefix('rsshub://').lstrip('/')}",
                            site_url=top_feed.get("siteUrl", ""),
                            description=top_feed.get("description", ""),
                            categories=route_categories,
                            source="rsshub-top-feed",
                            generated=True,
                        )
                    )
                except ValueError:
                    continue
    return candidates, routes


def _download(url: str, request_get=requests.get) -> bytes:
    safe_http_url(url)
    response = request_get(
        url,
        headers=REQUEST_HEADERS,
        timeout=(10, 60),
        stream=True,
    )
    try:
        response.raise_for_status()
        content_length = response.headers.get("Content-Length")
        if content_length and int(content_length) > MAX_CATALOG_BYTES:
            raise ValueError("catalog exceeds the download size limit")
        chunks = []
        size = 0
        for chunk in response.iter_content(chunk_size=128 * 1024):
            if not chunk:
                continue
            size += len(chunk)
            if size > MAX_CATALOG_BYTES:
                raise ValueError("catalog exceeds the download size limit")
            chunks.append(chunk)
        return b"".join(chunks)
    finally:
        response.close()


def _merge_candidate(existing: dict, incoming: dict):
    if incoming["feed_url"].startswith("https://"):
        existing["feed_url"] = incoming["feed_url"]
    for field in ("categories", "packs", "sources"):
        existing[field] = sorted(set(existing[field]) | set(incoming[field]))
    for field in ("site_url", "description", "language"):
        if not existing[field] and incoming[field]:
            existing[field] = incoming[field]
    existing["generated"] = existing["generated"] or incoming["generated"]


def sync_external_sources(
    project_root: Path,
    generated_at: datetime | None = None,
    request_get=requests.get,
):
    generated_at = generated_at or datetime.now(timezone.utc)
    config = json.loads(
        (project_root / "source_catalogs.json").read_text(encoding="utf-8")
    )
    template = (project_root / "EditREADME.md").read_text(encoding="utf-8")
    current_sources = [item.source for item in parse_source_templates(template)]
    current_keys = {canonical_feed_key(source.feed_url) for source in current_sources}

    merged = {}
    route_records = []
    catalog_reports = []
    for catalog in config.get("catalogs", []):
        try:
            payload = _download(catalog["url"], request_get=request_get)
            catalog_format = catalog["format"]
            if catalog_format == "tidings-json":
                candidates = parse_tidings(payload, catalog)
            elif catalog_format == "opml":
                candidates = parse_opml(payload, catalog["id"])
            elif catalog_format == "opml-zip":
                candidates = parse_opml_zip(payload, catalog)
            elif catalog_format == "rsshub-routes":
                candidates, route_records = parse_rsshub(payload, catalog)
            else:
                raise ValueError(f"unsupported catalog format: {catalog_format}")
            catalog_reports.append(
                {
                    "id": catalog["id"],
                    "format": catalog_format,
                    "url": catalog["url"],
                    "status": "ok",
                    "candidate_count": len(candidates),
                }
            )
            for candidate in candidates:
                key = canonical_feed_key(candidate["feed_url"])
                if key in current_keys:
                    continue
                if key in merged:
                    _merge_candidate(merged[key], candidate)
                else:
                    merged[key] = candidate
        except (
            OSError,
            ValueError,
            TypeError,
            KeyError,
            ET.ParseError,
            zipfile.BadZipFile,
            requests.RequestException,
        ) as error:
            catalog_reports.append(
                {
                    "id": catalog.get("id", "unknown"),
                    "format": catalog.get("format", "unknown"),
                    "url": catalog.get("url", ""),
                    "status": "error",
                    "error": type(error).__name__,
                    "candidate_count": 0,
                }
            )

    failed_catalogs = [
        f'{report["id"]} ({report["error"]})'
        for report in catalog_reports
        if report["status"] != "ok"
    ]
    if failed_catalogs:
        failed = ", ".join(failed_catalogs)
        raise RuntimeError(
            f"external source sync failed for {failed}; existing outputs preserved"
        )

    candidates = sorted(
        merged.values(), key=lambda item: (item["title"].casefold(), item["feed_url"])
    )
    generated = _generated_timestamp(generated_at)
    version_root = project_root / "docs/api/v1"
    write_json(
        version_root / "feed-candidates.json",
        {
            "api_version": API_VERSION,
            "generated_at": generated,
            "review_required": True,
            "current_feed_count": len(current_sources),
            "candidate_count": len(candidates),
            "catalogs": catalog_reports,
            "candidates": candidates,
        },
    )
    write_json(
        version_root / "rsshub-routes.json",
        {
            "api_version": API_VERSION,
            "generated_at": generated,
            "instance": next(
                (
                    item.get("instance", "https://rsshub.app")
                    for item in config["catalogs"]
                    if item.get("id") == "rsshub"
                ),
                "https://rsshub.app",
            ),
            "route_count": len(route_records),
            "routes": sorted(route_records, key=lambda item: item["path"]),
        },
    )
    return {
        "catalogs": catalog_reports,
        "candidate_count": len(candidates),
        "route_count": len(route_records),
    }
