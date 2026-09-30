import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from hashlib import sha256

from garss.models import Article, FeedResult, FeedSource
from garss.output import write_opml, write_static_api, prune_snapshots, publish_generated_files
from unittest.mock import patch


class OutputTests(unittest.TestCase):
    def test_publish_updates_snapshot_pointer_last(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            staging = root / "staging"
            write_static_api(staging / "docs", [], datetime(2026, 9, 30, tzinfo=timezone.utc), 30)
            with patch("garss.output.os.replace") as replace:
                publish_generated_files(staging, root / "published")
            paths = [call.args[1].relative_to(root / "published").as_posix() for call in replace.call_args_list]
            self.assertEqual(paths[-1], "docs/api/v1/meta.json")
            self.assertTrue(any("snapshots/" in path for path in paths[:-1]))

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
            snapshot = root / "api/v1/snapshots" / meta["snapshot_id"]
            manifest = json.loads((snapshot / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["snapshot_id"], meta["snapshot_id"])
            for name, expected in manifest["files"].items():
                self.assertEqual(sha256((snapshot / name).read_bytes()).hexdigest(), expected["sha256"])
                self.assertEqual((snapshot / name).read_bytes(), (root / "api/v1" / name).read_bytes())

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

    def test_snapshot_pruning_keeps_current_and_does_not_delete_other_directories(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for day in (27, 28, 29, 30):
                write_static_api(root, [], datetime(2026, 9, day, tzinfo=timezone.utc), 30)
            version = root / "api/v1"
            current = json.loads((version / "meta.json").read_text())["snapshot_id"]
            user_directory = version / "snapshots/user-files"
            user_directory.mkdir()
            prune_snapshots(version, keep=2)
            self.assertTrue((version / "snapshots" / current).is_dir())
            self.assertTrue(user_directory.is_dir())
            self.assertEqual(len(list((version / "snapshots").glob("*/manifest.json"))), 2)


if __name__ == "__main__":
    unittest.main()
