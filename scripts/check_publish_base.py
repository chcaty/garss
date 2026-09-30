"""Refuse to publish generated output if main changed during the build."""

import subprocess
import sys


def check_publish_base(cwd=None):
    try:
        subprocess.run(
            ["git", "fetch", "--no-tags", "origin", "refs/heads/main"],
            cwd=cwd,
            check=True,
        )
        def revision(ref):
            return subprocess.check_output(
                ["git", "rev-parse", ref], cwd=cwd, text=True
            ).strip()

        if revision("HEAD") != revision("FETCH_HEAD"):
            print(
                "::error::Remote main changed during generation. "
                "Output was not committed or published. Start a new run "
                "or re-run with the latest main; do not force-push.",
                file=sys.stderr,
            )
            return 1
    except (OSError, subprocess.CalledProcessError):
        print(
            "::error::Cannot verify remote main; refusing to publish.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(check_publish_base())
