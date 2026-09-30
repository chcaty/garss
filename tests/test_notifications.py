import json
import smtplib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import main
from garss import notifications
from garss.models import FeedResult


SMTP_ENV = {
    "SMTP_USER": "test@example.com",
    "SMTP_PASSWORD": "test-password",
    "SMTP_HOST": "smtp.example.com",
}


class NotificationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        (self.root / "_media").mkdir()
        (self.root / "EditREADME.md").write_text(
            "# RSS {{rss_num}} {{ga_rss_datetime}}\n"
            "邮件内容区开始>\n{{news}}\n<邮件内容区结束\n"
            "{{source_table}}\n",
            encoding="utf-8",
        )
        (self.root / "sources.json").write_text(json.dumps({
            "schema_version": "1.0", "sources": [{
                "id": "X001", "display_id": "X001", "title": "Example",
                "description": "Description", "feed_url": "https://example.com/feed",
                "category": "Example", "icon": "",
            }],
        }), encoding="utf-8")
        (self.root / "tasks.json").write_text(
            json.dumps({"tasks": [{"email": "reader@example.com"}]}),
            encoding="utf-8",
        )

    @staticmethod
    def fetched_results(sources, **kwargs):
        return [FeedResult(source=source) for source in sources]

    def test_smtp_authentication_failure_does_not_abort_build(self):
        with (
            patch.dict(notifications.os.environ, SMTP_ENV),
            patch("garss.runner.fetch_all", side_effect=self.fetched_results),
            patch(
                "garss.notifications.send_mail",
                side_effect=smtplib.SMTPAuthenticationError(535, b"private response"),
            ),
            self.assertLogs("garss.notifications", level="WARNING") as logs,
        ):
            results = main.build(project_root=self.root)

        self.assertEqual(len(results), 1)
        self.assertTrue((self.root / "docs/README.md").is_file())
        feeds = json.loads(
            (self.root / "docs/api/v1/feeds.json").read_text(encoding="utf-8")
        )
        self.assertEqual(feeds["feeds"][0]["id"], "X001")
        self.assertIn("SMTPAuthenticationError", logs.output[0])
        self.assertNotIn("private response", logs.output[0])

    def test_bad_recipient_configuration_only_warns(self):
        (self.root / "tasks.json").write_text("invalid JSON", encoding="utf-8")
        with (
            patch.dict(notifications.os.environ, SMTP_ENV),
            patch("garss.notifications.send_mail") as send,
            self.assertLogs("garss.notifications", level="WARNING"),
        ):
            self.assertFalse(main.notify_email(self.root, "<p>News</p>"))
        send.assert_not_called()

    def test_missing_smtp_configuration_skips_reading_files(self):
        with (
            patch.dict(notifications.os.environ, {}, clear=True),
            patch("garss.notifications.load_recipients") as load,
            patch("garss.notifications.send_mail") as send,
        ):
            self.assertFalse(main.notify_email(self.root))
        load.assert_not_called()
        send.assert_not_called()

    def test_no_email_build_skips_notification(self):
        with (
            patch("garss.runner.fetch_all", side_effect=self.fetched_results),
            patch("garss.runner.notify_email") as notify,
        ):
            main.build(project_root=self.root, send_email=False)
        notify.assert_not_called()

    def test_generation_failure_keeps_previous_published_outputs(self):
        (self.root / "docs").mkdir()
        (self.root / "docs/README.md").write_text("previous", encoding="utf-8")
        with (
            patch("garss.runner.fetch_all", side_effect=self.fetched_results),
            patch("garss.runner.write_static_api", side_effect=OSError("disk failure")),
        ):
            with self.assertRaises(OSError):
                main.build(project_root=self.root, send_email=False)
        self.assertEqual((self.root / "docs/README.md").read_text(), "previous")
        self.assertFalse((self.root / "build/notification.html").exists())

    def test_email_only_uses_generated_content_without_building(self):
        (self.root / "docs").mkdir()
        (self.root / "docs/README.md").write_text(
            "邮件内容区开始><p>Generated news</p><邮件内容区结束",
            encoding="utf-8",
        )
        with (
            patch.dict(notifications.os.environ, SMTP_ENV),
            patch("main.PROJECT_ROOT", self.root),
            patch("sys.argv", ["main.py", "--email-only"]),
            patch("main.build") as build,
            patch("garss.notifications.send_mail", return_value=True) as send,
        ):
            main.main()
        build.assert_not_called()
        send.assert_called_once_with(
            ["reader@example.com"], "嘎!RSS订阅", "<p>Generated news</p>"
        )

    def test_email_only_reads_artifact_without_a_generated_page(self):
        artifact = self.root / "notification.html"
        artifact.write_text("<p>Artifact news</p>", encoding="utf-8")
        with (
            patch.dict(notifications.os.environ, SMTP_ENV),
            patch("main.PROJECT_ROOT", self.root),
            patch("sys.argv", ["main.py", "--email-only", "--email-content", str(artifact)]),
            patch("main.build") as build,
            patch("garss.notifications.send_mail", return_value=True) as send,
        ):
            main.main()
        build.assert_not_called()
        send.assert_called_once_with(
            ["reader@example.com"], "嘎!RSS订阅", "<p>Artifact news</p>"
        )


if __name__ == "__main__":
    unittest.main()
