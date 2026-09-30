import json
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class ReviewPageTests(unittest.TestCase):
    def test_review_page_has_local_first_controls_and_assets(self):
        page = (PROJECT_ROOT / "docs/review.html").read_text(encoding="utf-8")
        script = (PROJECT_ROOT / "docs/assets/review.js").read_text(encoding="utf-8")
        stylesheet = (PROJECT_ROOT / "docs/assets/review.css").read_text(
            encoding="utf-8"
        )

        for element_id in (
            "candidate-search",
            "source-filter",
            "status-filter",
            "approve-selected",
            "reject-selected",
            "export-reviews",
            "export-opml",
            "import-reviews",
            "route-search",
            "install-app",
            "connection-status",
        ):
            self.assertIn(f'id="{element_id}"', page)

        self.assertIn("./assets/review.js", page)
        self.assertIn("./assets/review.css", page)
        self.assertIn("./manifest.webmanifest", page)
        self.assertIn("./api/v1/feed-candidates.json", script)
        self.assertIn("./api/v1/rsshub-routes.json", script)
        self.assertIn("./api/v1/review-schema.json", script)
        self.assertIn("localStorage", script)
        self.assertIn("serviceWorker", script)
        self.assertIn("beforeinstallprompt", script)
        self.assertNotIn("innerHTML", script)
        self.assertIn("@media (max-width: 720px)", stylesheet)

    def test_pwa_manifest_and_review_schema_are_versioned(self):
        manifest = json.loads(
            (PROJECT_ROOT / "docs/manifest.webmanifest").read_text(encoding="utf-8")
        )
        schema = json.loads(
            (PROJECT_ROOT / "docs/api/v1/review-schema.json").read_text(
                encoding="utf-8"
            )
        )
        service_worker = (PROJECT_ROOT / "docs/service-worker.js").read_text(
            encoding="utf-8"
        )

        self.assertEqual(manifest["display"], "standalone")
        self.assertEqual(manifest["start_url"], "./review.html")
        self.assertEqual(
            {icon["sizes"] for icon in manifest["icons"]}, {"192x192", "512x512"}
        )
        self.assertEqual(schema["properties"]["schema_version"]["const"], "1.0")
        self.assertIn("schema_url", schema["required"])
        self.assertIn("api/v1/feed-candidates.json", service_worker)
        self.assertIn("api/v1/rsshub-routes.json", service_worker)

        for icon in ("review-icon-192.png", "review-icon-512.png"):
            self.assertTrue((PROJECT_ROOT / "docs/_media" / icon).is_file())


if __name__ == "__main__":
    unittest.main()
