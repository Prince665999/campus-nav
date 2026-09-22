"""
run_reimport.py

Run the merge-safe re-import. Wraps backend.pipeline.reimport so you
don't have to remember the module path.

Usage:
    python admin/scripts/run_reimport.py
    python admin/scripts/run_reimport.py --osm path/to/map.osm
    python admin/scripts/run_reimport.py --dry-run

--dry-run parses the new map and reports what would change without
writing anything. Useful before a real reimport.
"""

import argparse
import sys

from _common import BOLD, DIM, GREEN, RESET, heading, info, session


def _print_report(report):
    heading("Re-import report")
    print(f"  {GREEN}Added{RESET}")
    print(f"    places: {report.places_added}")
    print(f"    areas:  {report.areas_added}")
    print(f"    edges:  {report.edges_added}")
    print(f"  {BOLD}Updated{RESET}")
    print(f"    places: {report.places_updated}")
    print(f"    areas:  {report.areas_updated}")
    print(f"    edges:  {report.edges_updated}")
    print(f"  {DIM}Unchanged{RESET}")
    print(f"    places: {report.places_unchanged}")
    print(f"    areas:  {report.areas_unchanged}")
    print(f"    edges:  {report.edges_unchanged}")


def main():
    parser = argparse.ArgumentParser(description="Merge-safe re-import.")
    parser.add_argument("--osm", help="Path to the OSM file. Defaults to backend/data/map.osm.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would change without writing.",
    )
    args = parser.parse_args()

    # The dry run is not currently implemented inside reimport.py.
    # When --dry-run is passed, tell the user and exit cleanly.
    if args.dry_run:
        info("Dry run is not implemented yet.")
        info("Run without --dry-run to apply the reimport.")
        info("Phase 14's admin website will add a proper diff view.")
        sys.exit(0)

    heading("Re-importing map.osm")
    from backend.pipeline.reimport import run_reimport

    try:
        report = run_reimport(osm_path=args.osm)
    except FileNotFoundError as e:
        print()
        print(f"  Map file not found: {e}")
        sys.exit(1)

    _print_report(report)

    from backend.api.services import cache_service
    from backend.api import cache

    if cache.is_available():
        cache_service.invalidate_routes()
        cache_service.invalidate_narrations()
        print("  Cache invalidated (map changed).")
    else:
        print("  Cache not available; nothing to invalidate.")

    print()


if __name__ == "__main__":
    main()