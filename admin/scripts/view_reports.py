"""
view_reports.py

List student reports. Used to triage the report queue before Phase 14
builds the web UI.

Usage:
    python admin/scripts/view_reports.py
    python admin/scripts/view_reports.py --status new
    python admin/scripts/view_reports.py --kind blocked
    python admin/scripts/view_reports.py --id 42
    python admin/scripts/view_reports.py --resolve 42
    python admin/scripts/view_reports.py --in-progress 42
"""

import argparse
import sys
from datetime import datetime

from _common import BOLD, DIM, GREEN, RESET, YELLOW, error, heading, info, session


def _fmt_date(dt):
    if dt is None:
        return "?"
    if isinstance(dt, str):
        return dt
    return dt.strftime("%Y-%m-%d %H:%M")


def _print_report(r, place_name=None):
    status_colour = GREEN if r.status == "resolved" else YELLOW
    print(f"\n  {BOLD}#{r.id}{RESET}  {status_colour}[{r.status}]{RESET}  {r.kind}")
    print(f"    {DIM}Created: {_fmt_date(r.created_at)}{RESET}")
    if place_name:
        print(f"    Place: {place_name}")
    if r.body:
        print(f"    {r.body}")
    if r.photo_url:
        print(f"    Photo: {r.photo_url}")


def cmd_list(args):
    from backend.api.models.place import Place
    from backend.api.services import report_service

    with session() as s:
        reports = report_service.list_reports(
            s, status=args.status, kind=args.kind, limit=args.limit
        )

        if not reports:
            info("No reports match those filters.")
            return

        heading(f"{len(reports)} report(s)")

        # Look up place names in one query so the output is useful.
        place_ids = {r.place_id for r in reports if r.place_id}
        places_by_id = {}
        if place_ids:
            for p in s.query(Place).filter(Place.id.in_(place_ids)).all():
                places_by_id[p.id] = p.name

        for r in reports:
            _print_report(r, place_name=places_by_id.get(r.place_id))


def cmd_show(args):
    from backend.api.models.place import Place
    from backend.api.models.report import Report

    with session() as s:
        r = s.query(Report).filter_by(id=args.id).one_or_none()
        if r is None:
            error(f"Report {args.id} not found.")
            sys.exit(1)

        place_name = None
        if r.place_id:
            p = s.query(Place).filter_by(id=r.place_id).one_or_none()
            if p:
                place_name = p.name

        heading(f"Report #{r.id}")
        _print_report(r, place_name=place_name)


def cmd_update_status(args, new_status: str):
    from backend.api.services import report_service

    with session() as s:
        ok = report_service.update_status(s, args.id, new_status)
        if not ok:
            error(f"Report {args.id} not found.")
            sys.exit(1)
        print(f"Report {args.id} is now {new_status}.")


def main():
    parser = argparse.ArgumentParser(description="View and triage reports.")
    parser.add_argument("--status", choices=["new", "in_progress", "resolved"])
    parser.add_argument("--kind")
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--id", type=int, help="Show one report by id.")
    parser.add_argument("--resolve", type=int, metavar="ID", help="Mark a report resolved.")
    parser.add_argument("--in-progress", type=int, metavar="ID", help="Mark a report in progress.")

    args = parser.parse_args()

    if args.resolve is not None:
        args.id = args.resolve
        return cmd_update_status(args, "resolved")
    if args.in_progress is not None:
        args.id = args.in_progress
        return cmd_update_status(args, "in_progress")

    if args.id is not None:
        return cmd_show(args)

    return cmd_list(args)


if __name__ == "__main__":
    main()