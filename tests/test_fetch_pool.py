import unittest
from datetime import date
from unittest.mock import Mock, patch

import main
from garss.models import FeedSource, FeedResult


class FetchPoolTests(unittest.TestCase):
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
