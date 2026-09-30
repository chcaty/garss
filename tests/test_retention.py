import time
import unittest
from datetime import date

from cleanup import cleanup_expired_article_info
from retention import filter_recent_entries, retention_cutoff


def parsed_date(value):
    return time.strptime(value, "%Y-%m-%d")


class RetentionTests(unittest.TestCase):
    def test_cutoff_is_inclusive(self):
        self.assertEqual(retention_cutoff(date(2026, 9, 30), 30), date(2026, 9, 1))

        entries = [
            {"title": "boundary", "published_parsed": parsed_date("2026-09-01")},
            {"title": "expired", "published_parsed": parsed_date("2026-08-31")},
            {"title": "recent", "updated_parsed": parsed_date("2026-09-30")},
            {"title": "unknown"},
        ]
        kept = filter_recent_entries(entries, today=date(2026, 9, 30))
        self.assertEqual([entry["title"] for entry in kept], ["boundary", "recent"])

    def test_invalid_retention_is_rejected(self):
        with self.assertRaises(ValueError):
            retention_cutoff(date(2026, 9, 30), 0)

    def test_generated_markdown_cleanup(self):
        content = (
            "| feed | [‣ old \\| 2026-08-31](https://example.com/old)<br/>"
            "[‣ boundary \\| 2026-09-01](https://example.com/boundary)<br/>"
            "[‣ recent 🌈 2026-09-30](https://example.com/recent) | source |\n"
        )
        cleaned, removed = cleanup_expired_article_info(
            content, today=date(2026, 9, 30)
        )
        self.assertEqual(removed, 1)
        self.assertNotIn("old", cleaned)
        self.assertIn("boundary", cleaned)
        self.assertIn("recent", cleaned)

    def test_empty_article_cell_gets_a_clear_placeholder(self):
        content = (
            "| feed | description | "
            "[‣ old \\| 2026-08-01](https://example.com/old) | "
            "[订阅地址](https://example.com/feed) |\n"
        )
        cleaned, removed = cleanup_expired_article_info(
            content, today=date(2026, 9, 30)
        )
        self.assertEqual(removed, 1)
        self.assertIn("[近30天暂无更新](https://example.com/feed)", cleaned)


    def test_window_contains_exactly_requested_dates(self):
        today = date(2026, 9, 30)
        for days in (1, 7, 30):
            self.assertEqual((today - retention_cutoff(today, days)).days + 1, days)

    def test_custom_retention_placeholder(self):
        content = (
            "| feed | description | "
            "[‣ old \\| 2026-09-20](https://example.com/old) | "
            "[订阅地址](https://example.com/feed) |\n"
        )
        cleaned, removed = cleanup_expired_article_info(
            content, today=date(2026, 9, 30), retention_days=7
        )
        self.assertEqual(removed, 1)
        self.assertIn("近7天暂无更新", cleaned)


if __name__ == "__main__":
    unittest.main()
