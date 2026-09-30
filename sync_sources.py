import logging
from pathlib import Path

from garss.external_sources import sync_external_sources

PROJECT_ROOT = Path(__file__).resolve().parent
LOGGER = logging.getLogger(__name__)


def main():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    summary = sync_external_sources(PROJECT_ROOT)
    for catalog in summary["catalogs"]:
        LOGGER.info(
            "%s: %s (%d candidate records)",
            catalog["id"],
            catalog["status"],
            catalog["candidate_count"],
        )
    LOGGER.info(
        "Generated %d unique candidate feeds and %d RSSHub routes",
        summary["candidate_count"],
        summary["route_count"],
    )


if __name__ == "__main__":
    main()
