"""
import_timetable.py

Read a timetable CSV and load it into the database. Every row in the
CSV is one class slot. The file is validated row-by-row before
anything is written — if any row is bad, the whole import is aborted
so we never write a partial timetable.

Usage:

    # Dry run first — validates and reports, writes nothing.
    python admin/scripts/import_timetable.py --file timetable.csv --dry-run

    # Real import — inserts new rows, updates existing ones.
    python admin/scripts/import_timetable.py --file timetable.csv

    # Replace mode — wipes the program-years the CSV mentions and
    # re-creates them. Use when the department gives you a corrected
    # full timetable for the same program/year.
    python admin/scripts/import_timetable.py --file timetable.csv --replace

Exit codes:
  0 — import succeeded (or dry run passed)
  1 — validation failed, nothing was written
"""

import argparse
import csv
import sys
from pathlib import Path

# Repo root on sys.path so `backend...` imports resolve.
_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.api.db.init_db import init_db
from backend.api.db.session import session_scope
from backend.api.models.program import Program
from backend.api.models.program_year import ProgramYear
from backend.api.models.timetable_entry import (
    DAY_NAMES,
    TimetableEntry,
)


_REQUIRED_COLUMNS = {
    "program",
    "year",
    "academic_year",
    "semester",
    "day",
    "start_time",
    "end_time",
    "module_code",
}


_DAY_LOOKUP = {name.lower(): num for num, name in DAY_NAMES.items()}
for _num in range(7):
    _DAY_LOOKUP[str(_num)] = _num


def _parse_bool(value: str) -> bool:
    if value is None:
        return False
    v = str(value).strip().lower()
    return v in ("yes", "true", "1", "y", "t")


def _parse_day(value: str) -> int | None:
    if value is None:
        return None
    return _DAY_LOOKUP.get(str(value).strip().lower())


def _validate_time(value: str) -> bool:
    """Accepts HH:MM, 24-hour, zero-padded. Rejects 7:30, 7:30 AM, etc."""
    if not value:
        return False
    s = str(value).strip()
    if len(s) != 5 or s[2] != ":":
        return False
    hh, mm = s[:2], s[3:]
    if not (hh.isdigit() and mm.isdigit()):
        return False
    h, m = int(hh), int(mm)
    return 0 <= h <= 23 and 0 <= m <= 59


def _load_and_validate(path: Path) -> list[dict]:
    """Read the CSV. Raise ValueError if anything is wrong."""
    if not path.exists():
        raise ValueError(f"CSV not found: {path}")

    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None:
            raise ValueError("CSV has no header row")

        headers = {h.strip().lower() for h in reader.fieldnames}
        missing = _REQUIRED_COLUMNS - headers
        if missing:
            raise ValueError(
                "CSV is missing required columns: " + ", ".join(sorted(missing))
            )

        rows = []
        errors = []
        for line_no, raw in enumerate(reader, start=2):  # start=2 because row 1 is headers
            # Normalise the row keys to lowercase stripped.
            row = {
                (k or "").strip().lower(): (v or "").strip()
                for k, v in raw.items()
            }

            # Skip blank rows silently.
            if not any(row.values()):
                continue

            day = _parse_day(row.get("day", ""))
            if day is None:
                errors.append(
                    f"line {line_no}: day '{row.get('day')}' is not a "
                    f"day name or 0–6"
                )
                continue

            if not _validate_time(row.get("start_time", "")):
                errors.append(
                    f"line {line_no}: start_time '{row.get('start_time')}' "
                    f"must be HH:MM (e.g. 07:30)"
                )
                continue

            if not _validate_time(row.get("end_time", "")):
                errors.append(
                    f"line {line_no}: end_time '{row.get('end_time')}' "
                    f"must be HH:MM (e.g. 08:15)"
                )
                continue

            try:
                year_num = int(row["year"])
                semester = int(row["semester"])
            except (KeyError, ValueError) as e:
                errors.append(f"line {line_no}: year or semester not an integer ({e})")
                continue

            if not row.get("program"):
                errors.append(f"line {line_no}: program is blank")
                continue

            if not row.get("module_code"):
                errors.append(f"line {line_no}: module_code is blank")
                continue

            rows.append({
                "program": row["program"],
                "year_number": year_num,
                "academic_year": row["academic_year"],
                "semester": semester,
                "day_of_week": day,
                "start_time": row["start_time"],
                "end_time": row["end_time"],
                "module_code": row["module_code"],
                "module_name": row.get("module_name") or None,
                "lecturer_name": row.get("lecturer") or None,
                "venue_code": row.get("venue") or None,
                "is_cross_cutting": _parse_bool(row.get("cross_cutting")),
            })

    if errors:
        # Show the first 20 errors — more than that usually means the
        # CSV is fundamentally malformed.
        shown = errors[:20]
        msg = "CSV validation failed:\n  " + "\n  ".join(shown)
        if len(errors) > len(shown):
            msg += f"\n  ...and {len(errors) - len(shown)} more."
        raise ValueError(msg)

    if not rows:
        raise ValueError("CSV contained no data rows.")

    return rows


def _import(rows: list[dict], replace: bool, dry_run: bool):
    """Write the rows. Returns a report dict."""
    init_db()

    report = {
        "programs_created": 0,
        "program_years_created": 0,
        "program_years_wiped": 0,
        "entries_created": 0,
        "entries_updated": 0,
        "entries_unchanged": 0,
    }

    # If dry_run, we still want to compute the report, so we do
    # everything inside a transaction and roll back at the end.
    with session_scope() as session:
        # Group rows by (program, year, academic_year, semester).
        groups: dict[tuple, list[dict]] = {}
        for row in rows:
            key = (
                row["program"],
                row["year_number"],
                row["academic_year"],
                row["semester"],
            )
            groups.setdefault(key, []).append(row)

        for (program_name, year_num, academic_year, semester), group_rows in groups.items():
            # --- find or create the program ---
            program = (
                session.query(Program)
                .filter(Program.name == program_name)
                .one_or_none()
            )
            if program is None:
                program = Program(name=program_name)
                session.add(program)
                session.flush()
                report["programs_created"] += 1

            # --- find or create the program-year ---
            py = (
                session.query(ProgramYear)
                .filter_by(
                    program_id=program.id,
                    year_number=year_num,
                    academic_year=academic_year,
                    semester=semester,
                )
                .one_or_none()
            )
            if py is None:
                py = ProgramYear(
                    program_id=program.id,
                    year_number=year_num,
                    academic_year=academic_year,
                    semester=semester,
                )
                session.add(py)
                session.flush()
                report["program_years_created"] += 1

            # --- replace mode: wipe existing entries for this program-year ---
            if replace:
                deleted = (
                    session.query(TimetableEntry)
                    .filter(TimetableEntry.program_year_id == py.id)
                    .delete(synchronize_session=False)
                )
                report["program_years_wiped"] += 1

            # --- upsert each entry ---
            for row in group_rows:
                existing = (
                    session.query(TimetableEntry)
                    .filter_by(
                        program_year_id=py.id,
                        day_of_week=row["day_of_week"],
                        start_time=row["start_time"],
                        module_code=row["module_code"],
                    )
                    .one_or_none()
                )
                if existing is None:
                    session.add(
                        TimetableEntry(
                            program_year_id=py.id,
                            day_of_week=row["day_of_week"],
                            start_time=row["start_time"],
                            end_time=row["end_time"],
                            module_code=row["module_code"],
                            module_name=row["module_name"],
                            lecturer_name=row["lecturer_name"],
                            venue_code=row["venue_code"],
                            is_cross_cutting=row["is_cross_cutting"],
                        )
                    )
                    report["entries_created"] += 1
                else:
                    changed = False
                    for field in (
                        "end_time",
                        "module_name",
                        "lecturer_name",
                        "venue_code",
                        "is_cross_cutting",
                    ):
                        if getattr(existing, field) != row[field]:
                            setattr(existing, field, row[field])
                            changed = True
                    if changed:
                        report["entries_updated"] += 1
                    else:
                        report["entries_unchanged"] += 1

        if dry_run:
            # Roll back so nothing is written.
            session.rollback()

    return report


def _print_report(report: dict, dry_run: bool):
    header = "Dry run — nothing written" if dry_run else "Import complete"
    print()
    print(header)
    print(f"  programs created:         {report['programs_created']}")
    print(f"  program-years created:    {report['program_years_created']}")
    if report["program_years_wiped"]:
        print(f"  program-years wiped:      {report['program_years_wiped']}")
    print(f"  entries created:          {report['entries_created']}")
    print(f"  entries updated:          {report['entries_updated']}")
    print(f"  entries unchanged:        {report['entries_unchanged']}")
    print()


def main():
    parser = argparse.ArgumentParser(description="Import a timetable CSV.")
    parser.add_argument("--file", required=True, help="Path to the CSV.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate and report, write nothing.",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help=(
            "Delete existing entries for each program-year the CSV "
            "mentions, then insert fresh. Use for corrected full "
            "timetables."
        ),
    )
    args = parser.parse_args()

    path = Path(args.file)
    try:
        rows = _load_and_validate(path)
    except ValueError as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)

    print(f"Parsed {len(rows)} rows from {path}.")

    report = _import(rows, replace=args.replace, dry_run=args.dry_run)
    _print_report(report, dry_run=args.dry_run)


if __name__ == "__main__":
    main()