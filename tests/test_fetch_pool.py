import unittest
from datetime import date, datetime, timezone
from unittest.mock import Mock, patch

import main
from garss.models import FeedSource, FeedResult, Article


class FetchPoolTests(unittest.TestCase):
    def test_duplicate_urls_download_once_without_changing_article_identity(self):
        sources = [FeedSource(str(i), "Example", "", "https://example.com/feed") for i in range(2)]
        article = Article("0", "Title", "https://example.com/item", datetime(2026, 9, 30, tzinfo=timezone.utc))
        with patch("main.requests.Session"), patch(
            "main.fetch_feed", return_value=FeedResult(sources[0], [article])
        ) as fetch:
            results = main.fetch_all(sources, date(2026, 9, 30), 8)
        fetch.assert_called_once()
        self.assertEqual([result.source for result in results], sources)
        self.assertEqual([result.articles[0].source_id for result in results], ["0", "1"])
        self.assertEqual(results[0].articles[0].id, article.id)
        self.assertNotEqual(results[0].articles[0].id, results[1].articles[0].id)
        results[0].articles.clear()
        self.assertEqual(len(results[1].articles), 1)

    def test_shared_download_failure_is_reported_for_each_source(self):
        sources = [FeedSource(str(i), "Example", "", "https://example.com/feed") for i in range(2)]
        with patch("main.requests.Session") as session, patch(
            "main.fetch_feed", side_effect=RuntimeError("broken feed")
        ) as fetch, self.assertLogs("main", level="ERROR"):
            results = main.fetch_all(sources, date(2026, 9, 30), 8)
        fetch.assert_called_once()
        self.assertEqual([result.error for result in results], ["broken feed", "broken feed"])
        session.return_value.close.assert_called_once()

    def test_session_is_reused_per_worker_and_closed(self):
        sources = [FeedSource(str(i), "Example", "", f"https://example.com/{i}") for i in range(2)]
        session = Mock()
        with patch("main.requests.Session", return_value=session) as factory, patch(
            "main.fetch_feed", side_effect=lambda source, **kwargs: FeedResult(source)
        ) as fetch:
            results = main.fetch_all(sources, date(2026, 9, 30), workers=1)
        self.assertEqual([result.source for result in results], sources)
        factory.assert_called_once()
        session.close.assert_called_once()
        self.assertEqual(session.cookies.clear.call_count, 2)
        self.assertTrue(all(call.kwargs["request_get"] == session.get for call in fetch.call_args_list))

    def test_empty_sources_and_invalid_workers(self):
        self.assertEqual(main.fetch_all([], date.today(), 1), [])
        with self.assertRaises(ValueError):
            main.fetch_all([], date.today(), 0)
