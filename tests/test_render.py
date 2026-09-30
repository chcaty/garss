import unittest
from datetime import datetime, timezone

from garss.catalog import parse_source_templates
from garss.models import Article, FeedResult
from garss.render import build_readme


class RenderTests(unittest.TestCase):
    def test_articles_are_escaped_and_use_their_own_dates(self):
        template = (
            "{{rss_num}} {{ga_rss_datetime}} {{new_num}} {{news}}\n"
            "邮件内容区开始>mail<邮件内容区结束\n"
            "| X001 | Feed | Description | {{latest_content}} | "
            "[订阅地址](https://example.com/feed.xml) |\n"
        )
        source_template = parse_source_templates(template)[0]
        result = FeedResult(
            source=source_template.source,
            articles=[
                Article(
                    source_id="X001",
                    title="<unsafe> [first]",
                    url="https://example.com/first_(item)",
                    published_at=datetime(2026, 9, 30, tzinfo=timezone.utc),
                ),
                Article(
                    source_id="X001",
                    title="second",
                    url="https://example.com/second",
                    published_at=datetime(2026, 9, 28, tzinfo=timezone.utc),
                ),
            ],
        )
        output, email_html = build_readme(
            template,
            [source_template],
            [result],
            datetime(2026, 9, 30, tzinfo=timezone.utc),
        )
        self.assertIn("&lt;unsafe&gt;", output)
        self.assertIn("first_%28item%29", output)
        self.assertIn("2026-09-28", output)
        self.assertFalse(any(line.endswith(" ") for line in output.splitlines()))
        self.assertEqual(email_html, "mail")


if __name__ == "__main__":
    unittest.main()
