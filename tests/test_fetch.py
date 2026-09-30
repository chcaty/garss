import unittest
from datetime import date

from garss.fetch import MAX_FEED_BYTES, _download_feed, _parse_articles
from garss.models import FeedSource


class FakeResponse:
    def __init__(self, chunks, content_length=None):
        self.chunks = chunks
        self.headers = {}
        self.closed = False
        if content_length is not None:
            self.headers["Content-Length"] = str(content_length)

    def raise_for_status(self):
        return None

    def iter_content(self, chunk_size):
        return iter(self.chunks)

    def close(self):
        self.closed = True


class FetchTests(unittest.TestCase):
    def setUp(self):
        self.source = FeedSource(
            "X001", "Example", "Example feed", "https://example.com/feed.xml"
        )

    def test_parser_filters_expired_unsafe_and_duplicate_articles(self):
        payload = b"""<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0"><channel><title>Example</title>
          <item><title>Recent</title><link>https://example.com/recent</link>
            <pubDate>Wed, 30 Sep 2026 08:00:00 GMT</pubDate></item>
          <item><title>Duplicate</title><link>https://example.com/recent</link>
            <pubDate>Tue, 29 Sep 2026 08:00:00 GMT</pubDate></item>
          <item><title>Yesterday</title><link>https://example.com/yesterday</link>
            <pubDate>Tue, 29 Sep 2026 08:00:00 GMT</pubDate></item>
          <item><title>Midnight local</title><link>https://example.com/midnight</link>
            <pubDate>Tue, 29 Sep 2026 16:30:00 GMT</pubDate></item>
          <item><title>Unsafe</title><link>javascript:alert(1)</link>
            <pubDate>Wed, 30 Sep 2026 08:00:00 GMT</pubDate></item>
          <item><title>Expired</title><link>https://example.com/expired</link>
            <pubDate>Sat, 01 Aug 2026 08:00:00 GMT</pubDate></item>
        </channel></rss>"""

        articles = _parse_articles(
            self.source,
            payload,
            today=date(2026, 9, 30),
            retention_days=30,
            only_date=date(2026, 9, 30),
        )

        self.assertEqual(
            [article.title for article in articles],
            ["Recent", "Midnight local"],
        )

    def test_download_rejects_oversized_response_and_closes_it(self):
        response = FakeResponse([], content_length=MAX_FEED_BYTES + 1)

        with self.assertRaises(ValueError):
            _download_feed(
                self.source.feed_url,
                timeout=1,
                request_get=lambda *args, **kwargs: response,
            )

        self.assertTrue(response.closed)


if __name__ == "__main__":
    unittest.main()
