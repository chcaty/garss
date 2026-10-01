"""Check feeds, publish observations, or require new review targets to be valid."""
import argparse
import json
import sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from garss.link_health import check_link
from urllib.parse import urlsplit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, help="JSON array of feed URLs")
    parser.add_argument("--require-valid", action="store_true")
    parser.add_argument("--candidate-limit", type=int, default=200)
    parser.add_argument("--workers", type=int, default=12)
    parser.add_argument("--output", type=Path, default=ROOT / "docs/api/v1/feed-health.json")
    args = parser.parse_args()
    previous = json.loads(args.output.read_text(encoding="utf-8")) if args.output.exists() else {"schema_version": "1.0", "checks": {}}
    if args.input:
        urls = json.loads(args.input.read_text(encoding="utf-8"))
        if not isinstance(urls, list) or any(not isinstance(url, str) for url in urls):
            parser.error("input must be an array of URL strings")
    else:
        sources = json.loads((ROOT / "sources.json").read_text(encoding="utf-8"))["sources"]
        candidates = json.loads((ROOT / "docs/api/v1/feed-candidates.json").read_text(encoding="utf-8"))["candidates"]
        # Oldest observations first: each scheduled build advances through the catalog.
        candidates.sort(key=lambda item: previous["checks"].get(item["feed_url"], {}).get("checked_at", ""))
        urls = [item["feed_url"] for item in sources + candidates[:max(0, args.candidate_limit)]]
    with ThreadPoolExecutor(max_workers=max(1, min(args.workers, 24))) as executor:
        results = list(executor.map(check_link, urls))
    print(json.dumps(dict(Counter(item["status"] for item in results)), ensure_ascii=False))
    if args.require_valid:
        failures = [item for item in results if item["status"] != "valid"]
        for item in failures:
            print(f'{item["feed_url"]}: {item["status"]}: {item["reason"]}')
        return int(bool(failures))
    previous["checks"].update({item["feed_url"]: item for item in results})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(".tmp")
    temporary.write_text(json.dumps(previous, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(args.output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
