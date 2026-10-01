"""GARSS command-line entry point; collection lives in garss.runner."""
import argparse
import logging
from pathlib import Path

from garss.runner import PROJECT_ROOT, build, fetch_all, notify_email
from retention import DEFAULT_RETENTION_DAYS


def parse_args():
    parser = argparse.ArgumentParser(description="Build GARSS pages and static API")
    parser.add_argument("--retention-days", type=int, default=DEFAULT_RETENTION_DAYS)
    parser.add_argument("--workers", type=int, default=16)
    parser.add_argument("--refresh-recent", action="store_true", help="Fetch the full retention window, including earlier posts")
    email_options = parser.add_mutually_exclusive_group()
    email_options.add_argument("--no-email", action="store_true")
    email_options.add_argument(
        "--email-only",
        action="store_true",
        help="Send email from the generated page without fetching feeds",
    )
    parser.add_argument("--email-content", type=Path, help="Generated notification artifact used with --email-only")
    return parser.parse_args()


def main():
    args = parse_args()
    if args.retention_days < 1:
        raise SystemExit("--retention-days must be at least 1")
    if args.workers < 1:
        raise SystemExit("--workers must be at least 1")
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    if args.email_only:
        notify_email(PROJECT_ROOT, content_path=args.email_content)
        return
    build(
        retention_days=args.retention_days,
        workers=args.workers,
        send_email=not args.no_email,
        refresh_recent=args.refresh_recent,
    )


if __name__ == "__main__":
    main()
