import unittest
from datetime import date, datetime, timezone

from garss.history import merge_recent_history
from garss.models import Article, FeedResult, FeedSource


class HistoryTests(unittest.TestCase):
    def test_today_is_merged_with_recent_cache_and_expired_items_are_removed(self):
        source = FeedSource(
            "X001", "Example", "Example feed", "https://example.com/feed.xml"
        )
        today_article = Article(
            source.id,
            "Today",
            "https://example.com/today",
            datetime(2026, 9, 30, tzinfo=timezone.utc),
        )
        cached_articles = [
            Article(
                source.id,
                "Yesterday",
                "https://example.com/yesterday",
                datetime(2026, 9, 29, tzinfo=timezone.utc),
            ),
            Article(
                source.id,
                "Expired",
                "https://example.com/expired",
                datetime(2026, 8, 1, tzinfo=timezone.utc),
            ),
            Article(
                source.id,
                "Future",
                "https://example.com/future",
                datetime(2026, 10, 1, tzinfo=timezone.utc),
            ),
        ]
        results = [FeedResult(source=source, articles=[today_article])]

        merged = merge_recent_history(
            results,
            cached_articles,
            today=date(2026, 9, 30),
            retention_days=30,
        )

        self.assertEqual(
            [article.title for article in merged[0].articles],
            ["Today", "Yesterday"],
        )


if __name__ == "__main__":
    unittest.main()
