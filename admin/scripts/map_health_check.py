"""
map_health_check.py

Report on the quality of the ingested campus map.

Nothing here is an error. Every check reports a count and a list of
examples, then exits 0. Run it any time to see what needs attention.

Usage:
    python admin/scripts/map_health_check.py
    python admin/scripts/map_health_check.py --verbose
    python admin/scripts/map_health_check.py --only disconnected_places

Exits 0 always, unless the map or database can't be read at all.
"""

import argparse
import sys

from _common import (
    BLUE,
    BOLD,
    DIM,
    RESET,
    error,
    heading,
    info,
    session,
)


def _print_check(check, verbose: bool):
    if check.count == 0:
        print(f"  {check.label}: {BOLD}OK{RESET}")
        return

    print(f"  {check.label}: {BOLD}{check.count}{RESET} to review")
    print(f"    {DIM}{check.description}{RESET}")

    if verbose and check.items:
        for item in check.items:
            if isinstance(item, dict):
                parts = [f"{k}={v}" for k, v in item.items()]
                print(f"      - {' '.join(parts)}")
            else:
                print(f"      - {item}")


def main():
    parser = argparse.ArgumentParser(description="Report on map quality.")
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Show example items for each check.",
    )
    parser.add_argument(
        "--only",
        help="Run only one check by key (e.g. disconnected_places).",
    )
    args = parser.parse_args()

    try:
        with session() as s:
            from backend.api.services.map_health_service import run_all_checks

            report = run_all_checks(s)

            if args.only:
                report.checks = [c for c in report.checks if c.key == args.only]
                if not report.checks:
                    error(f"No check with key '{args.only}'.")
                    sys.exit(1)

            heading("Map health report")
            print(f"  {DIM}These are all informational. Nothing here blocks anything.{RESET}")

            for check in report.checks:
                _print_check(check, verbose=args.verbose)

            total = report.total_issues()
            print()
            if total == 0:
                print(f"  {BLUE}Everything is tagged and connected.{RESET}")
            else:
                print(
                    f"  {BLUE}{total} items could be improved, none of them "
                    f"block the app.{RESET}"
                )
                if not args.verbose:
                    print(f"  {DIM}Run with --verbose to see examples.{RESET}")

    except FileNotFoundError as e:
        error(f"Could not read the map: {e}")
        sys.exit(1)
    except Exception as e:
        error(f"Unexpected error: {e}")
        sys.exit(1)

    # Always exit 0 — the checks are informational.
    sys.exit(0)


if __name__ == "__main__":
    main()