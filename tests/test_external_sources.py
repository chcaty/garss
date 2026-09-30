import io
import json
import tempfile
import unittest
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import requests

from garss.external_sources import (
    canonical_feed_key,
    parse_opml,
    parse_opml_zip,
    parse_rsshub,
    parse_tidings,
    sync_external_sources,
)


class FakeResponse:
    def __init__(self, payload: bytes):
        self.payload = payload
        self.headers = {"Content-Length": str(len(payload))}
        self.closed = False

    def raise_for_status(self):
        return None

    def iter_content(self, chunk_size):
        return iter([self.payload])

    def close(self):
        self.closed = True


class ExternalSourceTests(unittest.TestCase):
    def test_canonical_key_deduplicates_http_and_https(self):
        self.assertEqual(
            canonical_feed_key("http://Example.com:80/feed/"),
            canonical_feed_key("https://example.com/feed"),
        )

    def test_tidings_filters_non_article_kinds(self):
        payload = json.dumps(
            {
                "feeds": [
                    {
                        "title": "Article",
                        "feed_url": "https://example.com/article.xml",
                        "kind": "article",
                    },
                    {
                        "title": "Podcast",
                        "feed_url": "https://example.com/podcast.xml",
                        "kind": "podcast",
                    },
                ]
            }
        ).encode()

        candidates = parse_tidings(
            payload,
            {"id": "tidings", "kinds": ["article"]},
        )

        self.assertEqual([item["title"] for item in candidates], ["Article"])

    def test_opml_keeps_nested_category_and_rejects_doctype(self):
        payload = b"""<?xml version="1.0"?>
        <opml><body><outline text="Technology">
          <outline text="Example" xmlUrl="https://example.com/feed.xml" />
        </outline></body></opml>"""
        candidates = parse_opml(payload, "example")

        self.assertEqual(candidates[0]["categories"], ["Technology"])
        with self.assertRaises(ValueError):
            parse_opml(b"<!DOCTYPE opml><opml><body /></opml>", "example")

    def test_plenary_zip_only_reads_selected_directory(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr(
                "repo/recommended/without_category/Tech.opml",
                '<opml><body><outline text="Keep" '
                'xmlUrl="https://example.com/keep.xml" /></body></opml>',
            )
            archive.writestr(
                "repo/other/Ignore.opml",
                '<opml><body><outline text="Ignore" '
                'xmlUrl="https://example.com/ignore.xml" /></body></opml>',
            )

        candidates = parse_opml_zip(
            buffer.getvalue(),
            {
                "id": "plenary",
                "path_contains": "/recommended/without_category/",
            },
        )

        self.assertEqual([item["title"] for item in candidates], ["Keep"])
        self.assertEqual(candidates[0]["categories"], ["Tech"])

    def test_rsshub_routes_and_concrete_top_feeds_are_separate(self):
        payload = json.dumps(
            {
                "demo": {
                    "name": "Demo",
                    "categories": ["new-media"],
                    "routes": {
                        "/demo/:id": {
                            "name": "Demo route",
                            "example": "/demo/1",
                            "categories": ["social-media"],
                            "features": {
                                "requireConfig": False,
                                "supportRadar": True,
                            },
                            "topFeeds": [
                                {
                                    "title": "Concrete feed",
                                    "url": "rsshub://demo/1",
                                }
                            ],
                        }
                    },
                }
            }
        ).encode()

        candidates, routes = parse_rsshub(
            payload,
            {"instance": "https://rsshub.example"},
        )

        self.assertEqual(candidates[0]["feed_url"], "https://rsshub.example/demo/1")
        self.assertTrue(candidates[0]["generated"])
        self.assertEqual(routes[0]["path"], "/demo/:id")
        self.assertTrue(routes[0]["supports_radar"])

    def test_partial_sync_preserves_existing_outputs(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "docs/api/v1").mkdir(parents=True)
            candidate_path = root / "docs/api/v1/feed-candidates.json"
            route_path = root / "docs/api/v1/rsshub-routes.json"
            candidate_path.write_text("old candidates", encoding="utf-8")
            route_path.write_text("old routes", encoding="utf-8")
            (root / "sources.json").write_text(json.dumps({
                "schema_version": "1.0", "sources": [{
                    "id": "X001", "display_id": "X001", "title": "Existing",
                    "description": "Desc", "feed_url": "https://existing.example/feed.xml",
                    "category": "Example", "icon": "",
                }],
            }), encoding="utf-8")
            (root / "source_catalogs.json").write_text(
                json.dumps(
                    {
                        "catalogs": [
                            {
                                "id": "good",
                                "format": "tidings-json",
                                "url": "https://catalog.example/good.json",
                            },
                            {
                                "id": "bad",
                                "format": "opml",
                                "url": "https://catalog.example/bad.xml",
                            },
                        ]
                    }
                ),
                encoding="utf-8",
            )

            def request_get(url, **kwargs):
                if url.endswith("bad.xml"):
                    raise requests.ConnectionError("offline")
                return FakeResponse(b'{"feeds": []}')

            with self.assertRaises(RuntimeError):
                sync_external_sources(
                    root,
                    generated_at=datetime(2026, 9, 30, tzinfo=timezone.utc),
                    request_get=request_get,
                )

            self.assertEqual(candidate_path.read_text(encoding="utf-8"), "old candidates")
            self.assertEqual(route_path.read_text(encoding="utf-8"), "old routes")


if __name__ == "__main__":
    unittest.main()
