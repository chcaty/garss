import unittest
from pathlib import Path

from garss.catalog import parse_source_templates, safe_http_url

PROJECT_ROOT = Path(__file__).resolve().parents[1]


class CatalogTests(unittest.TestCase):
    def test_real_catalog_has_unique_sources(self):
        content = (PROJECT_ROOT / "EditREADME.md").read_text(encoding="utf-8")
        templates = parse_source_templates(content)
        self.assertEqual(len(templates), 238)
        self.assertEqual(len({item.source.id for item in templates}), 238)

    def test_non_http_urls_are_rejected(self):
        with self.assertRaises(ValueError):
            safe_http_url("javascript:alert(1)")


if __name__ == "__main__":
    unittest.main()
