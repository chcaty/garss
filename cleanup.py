"""Delete expired article information from generated Markdown files."""

import argparse
import re
from datetime import date
from pathlib import Path

from retention import DEFAULT_RETENTION_DAYS, retention_cutoff

ARTICLE_LINK_RE = re.compile(
    r"\[‣ .*?(?: 🌈 | \\\| )(\d{4}-\d{2}-\d{2})\]\([^)]+\)(?:<br/>)?"
)
EMPTY_INFO_CELL_RE = re.compile(r"\|\s*\|\s*(\[订阅地址\]\(([^)]+)\))")


def cleanup_expired_article_info(
    content: str,
    today: date | None = None,
    retention_days: int = DEFAULT_RETENTION_DAYS,
):
    """Remove dated generated article links older than the retention cutoff."""
    cutoff = retention_cutoff(today=today, retention_days=retention_days)
    removed = 0

    def remove_if_expired(match):
        nonlocal removed
        try:
            published = date.fromisoformat(match.group(1))
        except ValueError:
            return match.group(0)
        if published < cutoff:
            removed += 1
            return ""
        return match.group(0)

    cleaned = ARTICLE_LINK_RE.sub(remove_if_expired, content)
    # A removed first item can leave the second item with a leading separator.
    cleaned = re.sub(r"(\|\s*)<br/>(?=\[‣ )", r"\1", cleaned)
    # Keep the generated table useful when all recent articles were removed.
    cleaned = EMPTY_INFO_CELL_RE.sub(
        lambda match: (
            f"| [近{retention_days}天暂无更新]({match.group(2)}) | {match.group(1)}"
        ),
        cleaned,
    )
    # Rewritten rows should not inherit legacy Markdown trailing whitespace.
    cleaned = "\n".join(
        line.rstrip() if f"近{retention_days}天暂无更新" in line else line
        for line in cleaned.split("\n")
    )
    return cleaned, removed


def cleanup_file(path: Path, retention_days: int = DEFAULT_RETENTION_DAYS) -> int:
    content = path.read_text(encoding="utf-8")
    cleaned, removed = cleanup_expired_article_info(
        content, retention_days=retention_days
    )
    if cleaned != content:
        path.write_text(cleaned, encoding="utf-8")
    return removed


def main():
    parser = argparse.ArgumentParser(
        description="Delete expired RSS article information from generated files."
    )
    parser.add_argument("files", nargs="+", type=Path)
    parser.add_argument("--retention-days", type=int, default=DEFAULT_RETENTION_DAYS)
    args = parser.parse_args()

    total = 0
    for path in args.files:
        removed = cleanup_file(path, retention_days=args.retention_days)
        total += removed
        print(f"{path}: removed {removed} expired article(s)")
    print(f"Removed {total} expired article(s) in total")


if __name__ == "__main__":
    main()
