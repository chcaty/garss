import contextlib
import io
import subprocess
import tempfile
import unittest
from pathlib import Path

from scripts.check_publish_base import check_publish_base


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class PublishBaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.remote = root / "remote.git"
        self.local = root / "local"
        self.local.mkdir()
        self.git("init", "--bare", str(self.remote))
        self.git("init", "-b", "main")
        self.git("config", "user.name", "test")
        self.git("config", "user.email", "test@example.invalid")
        self.git("remote", "add", "origin", str(self.remote))
        self.git("commit", "--allow-empty", "-m", "initial")
        self.git("push", "origin", "main")
        self.initial = self.git("rev-parse", "HEAD")

    def git(self, *args):
        return subprocess.check_output(
            ["git", *args], cwd=self.local, text=True, stderr=subprocess.STDOUT
        ).strip()

    def test_matching_main_allows_publication(self):
        self.assertEqual(check_publish_base(self.local), 0)

    def test_remote_advance_blocks_without_changing_local_head(self):
        self.git("commit", "--allow-empty", "-m", "previous action output")
        latest = self.git("rev-parse", "HEAD")
        self.git("push", "origin", "main")
        self.git("checkout", "--detach", self.initial)
        with contextlib.redirect_stderr(io.StringIO()) as errors:
            self.assertEqual(check_publish_base(self.local), 1)
        self.assertIn("Remote main changed", errors.getvalue())
        self.assertEqual(self.git("rev-parse", "HEAD"), self.initial)
        self.assertEqual(self.git("rev-parse", "FETCH_HEAD"), latest)
        # A fresh checkout for the re-run fixes the stale base.
        self.git("checkout", "--detach", "FETCH_HEAD")
        self.assertEqual(check_publish_base(self.local), 0)

    def test_unverifiable_remote_blocks_publication(self):
        self.git("remote", "remove", "origin")
        with contextlib.redirect_stderr(io.StringIO()) as errors:
            self.assertEqual(check_publish_base(self.local), 1)
        self.assertIn("Cannot verify", errors.getvalue())

    def test_workflows_guard_commits_and_isolate_pages_configuration(self):
        build = (PROJECT_ROOT / ".github/workflows/build-and-deploy.yml").read_text(
            encoding="utf-8"
        )
        sync = (PROJECT_ROOT / ".github/workflows/sync-source-catalogs.yml").read_text(
            encoding="utf-8"
        )
        for workflow in (build, sync):
            self.assertIn("          ref: main", workflow)
            self.assertLess(
                workflow.index("python scripts/check_publish_base.py"),
                workflow.index("git commit"),
            )
            self.assertNotIn("--force", workflow)
        build_job, downstream = build.split("\n  deploy:", 1)
        deploy_job, notify_job = downstream.split("\n  notify:", 1)
        self.assertNotIn("actions/configure-pages", build_job)
        self.assertIn("actions/configure-pages@v5", deploy_job)
        self.assertIn("needs: build", notify_job)
        self.assertNotIn("needs: deploy", notify_job)


if __name__ == "__main__":
    unittest.main()
