import unittest
import json
import tempfile
from pathlib import Path

from garss.catalog import load_source_templates, safe_http_url

PROJECT_ROOT = Path(__file__).resolve().parents[1]


class CatalogTests(unittest.TestCase):
    def test_real_catalog_has_unique_sources(self):
        templates = load_source_templates(PROJECT_ROOT / "sources.json")
        self.assertGreater(len(templates), 0)
        self.assertEqual(len({item.source.id for item in templates}), len(templates))
        feeds = json.loads((PROJECT_ROOT / "docs/api/v1/feeds.json").read_text(encoding="utf-8"))
        previous_ids = {}
        for item in feeds["feeds"]:
            previous_ids.setdefault(item["feed_url"], set()).add(item["id"])
        for item in templates:
            if item.source.feed_url in previous_ids:
                self.assertIn(item.source.id, previous_ids[item.source.feed_url])

    def test_invalid_catalog_records_are_rejected(self):
        item = json.loads((PROJECT_ROOT / "sources.json").read_text(encoding="utf-8"))["sources"][0]
        invalid_entries = [
            [item, item],
            [{**item, "icon": "../private.png"}],
            [{**item, "icon": "C:/private.png"}],
            [{**item, "feed_url": "javascript:alert(1)"}],
            [{**item, "title": " "}],
            [{**item, "category": None}],
        ]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sources.json"
            for entries in invalid_entries:
                with self.subTest(entries=entries):
                    path.write_text(json.dumps({"schema_version": "1.0", "sources": entries}), encoding="utf-8")
                    with self.assertRaises(ValueError):
                        load_source_templates(path)

    def test_removing_duplicate_display_id_preserves_source_identity(self):
        payload = json.loads((PROJECT_ROOT / "sources.json").read_text(encoding="utf-8"))
        grouped = {}
        for item in payload["sources"]:
            grouped.setdefault(item["display_id"], []).append(item)
        duplicates = next(items for items in grouped.values() if len(items) > 1)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sources.json"
            path.write_text(json.dumps({"schema_version": "1.0", "sources": duplicates[1:]}), encoding="utf-8")
            loaded = load_source_templates(path)
            self.assertEqual(loaded[0].source.id, duplicates[1]["id"])

    def test_non_http_urls_are_rejected(self):
        with self.assertRaises(ValueError):
            safe_http_url("javascript:alert(1)")


if __name__ == "__main__":
    unittest.main()
