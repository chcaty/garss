import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from garss.models import Article, FeedResult, FeedSource
from garss.output import write_opml, write_static_api


class OutputTests(unittest.TestCase):
    def test_versioned_api_and_xml_are_generated(self):
        source = FeedSource(
            "X001", "A & B", "<description>", "https://example.com/feed"
        )
        result = FeedResult(
            source=source,
            articles=[
                Article(
                    source_id=source.id,
                    title="Article",
                    url="https://example.com/article",
                    published_at=datetime(2026, 9, 30, tzinfo=timezone.utc),
                )
            ],
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_static_api(
                root,
                [result],
                datetime(2026, 9, 30, tzinfo=timezone.utc),
                30,
            )
            articles = json.loads(
                (root / "api/v1/articles.json").read_text(encoding="utf-8")
            )
            meta = json.loads((root / "api/v1/meta.json").read_text(encoding="utf-8"))
            self.assertEqual(articles["api_version"], "1.0")
            self.assertEqual(articles["articles"][0]["source_id"], "X001")
            self.assertEqual(meta["feed_candidates_endpoint"], "./feed-candidates.json")
            self.assertEqual(meta["rsshub_routes_endpoint"], "./rsshub-routes.json")
            self.assertEqual(meta["review_schema_endpoint"], "./review-schema.json")

            opml = root / "feeds.opml"
            write_opml(
                opml,
                [source],
                "2.0",
                datetime(2026, 9, 30, tzinfo=timezone.utc),
            )
            xml = opml.read_text(encoding="utf-8")
            self.assertIn("A &amp; B", xml)
            self.assertIn("&lt;description&gt;", xml)


if __name__ == "__main__":
    unittest.main()
