"""
timetable_service.py

Read timetable data. All the SQL lives here; the routers are thin.

Venue resolution
----------------
When a TimetableEntry has a `venue_code`, we look up a Place whose
`ref` matches that code. If we find one, the response includes the
place's name and id, which the mobile app uses for "Take me there".
If we don't find one, the entry still returns with its venue_code,
just no place_id — the app shows the venue as text.

Adjacent-slot merging
---------------------
A timetable typically lists a two-hour session as three 45-minute
rows (07:30–08:15, 08:15–09:00, 09:00–09:45). Students don't need to
see three rows — they need to see one period from 07:30 to 09:45.

We merge adjacent entries at read time when they:
  - are on the same day,
  - have the same module_code,
  - have the same venue_code,
  - have the same lecturer_name,
  - and touch exactly: next.start_time == current.end_time.

The first row's start_time and the last row's end_time are kept.
Raw, unmerged data is still available with raw=True — the admin
viewer uses this, and it's useful for debugging.
"""

from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from ..models.place import Place
from ..models.program import Program
from ..models.program_year import ProgramYear
from ..models.timetable_entry import TimetableEntry
from ..schemas.timetable import (
    NextClassResponse,
    ProgramItem,
    ProgramYearItem,
    TimetableEntryItem,
    TimetableWeekResponse,
)


def list_programs(session: Session) -> list[ProgramItem]:
    """Every program, alphabetical."""
    rows = session.query(Program).order_by(Program.name).all()
    return [
        ProgramItem(
            id=p.id,
            name=p.name,
            department=p.department,
            code=p.code,
            level=p.level,
        )
        for p in rows
    ]


def list_years_for_program(session: Session, program_id: int) -> list[ProgramYearItem]:
    """Every year-level for one program, ordered by year then semester."""
    rows = (
        session.query(ProgramYear)
        .filter_by(program_id=program_id)
        .order_by(ProgramYear.year_number, ProgramYear.semester)
        .all()
    )
    return [_to_year_item(py) for py in rows]


def _to_year_item(py: ProgramYear) -> ProgramYearItem:
    return ProgramYearItem(
        id=py.id,
        program_id=py.program_id,
        year_number=py.year_number,
        academic_year=py.academic_year,
        semester=py.semester,
        display_name=py.display_name,
    )


def get_week(
    session: Session,
    program_year_id: int,
    merge_adjacent: bool = True,
) -> TimetableWeekResponse:
    """
    Every entry for one program-year, in chronological order.

    By default, adjacent rows with the same module/venue/lecturer
    that touch exactly are merged into a single period. Pass
    merge_adjacent=False to return the raw rows.
    """
    entries = (
        session.query(TimetableEntry)
        .filter_by(program_year_id=program_year_id)
        .order_by(
            TimetableEntry.day_of_week,
            TimetableEntry.start_time,
        )
        .all()
    )

    if merge_adjacent:
        entries = _merge_adjacent(entries)

    venue_places = _venue_places_for(session, entries)

    return TimetableWeekResponse(
        program_year_id=program_year_id,
        entries=[_to_entry_item(e, venue_places) for e in entries],
    )


def _merge_adjacent(entries: list[TimetableEntry]) -> list[TimetableEntry]:
    """
    Merge runs of adjacent entries that represent the same continuing
    period. See the module docstring for the rule.

    Returns a new list. The merged rows are lightweight copies of the
    original ORM objects — we mutate a shallow copy so we don't modify
    anything in the session.
    """
    if not entries:
        return []

    merged = []
    for entry in entries:
        if not merged:
            merged.append(_copy_entry(entry))
            continue

        prev = merged[-1]
        if _should_merge(prev, entry):
            # Extend the previous entry's end time.
            prev.end_time = entry.end_time
        else:
            merged.append(_copy_entry(entry))

    return merged


def _copy_entry(entry: TimetableEntry) -> TimetableEntry:
    """
    Shallow copy of a TimetableEntry. The merged list uses copies so
    we never mutate an object that's still attached to the session.
    """
    copy = TimetableEntry(
        program_year_id=entry.program_year_id,
        day_of_week=entry.day_of_week,
        start_time=entry.start_time,
        end_time=entry.end_time,
        module_code=entry.module_code,
        module_name=entry.module_name,
        lecturer_name=entry.lecturer_name,
        venue_code=entry.venue_code,
        is_cross_cutting=entry.is_cross_cutting,
        notes=entry.notes,
    )
    copy.id = entry.id
    return copy


def _should_merge(prev: TimetableEntry, current: TimetableEntry) -> bool:
    """
    Whether `current` is a direct continuation of `prev`.

    All of these must be true:
      - same day
      - same module code
      - same venue
      - same lecturer
      - prev.end_time exactly equals current.start_time
    """
    return (
        prev.day_of_week == current.day_of_week
        and prev.module_code == current.module_code
        and (prev.venue_code or "") == (current.venue_code or "")
        and (prev.lecturer_name or "") == (current.lecturer_name or "")
        and prev.end_time == current.start_time
    )


def _venue_places_for(session: Session, entries: list[TimetableEntry]) -> dict:
    """
    Given a list of entries, return a dict mapping venue_code -> Place
    for any codes that match a Place.ref. Codes with no match are
    simply absent from the dict.
    """
    codes = {e.venue_code for e in entries if e.venue_code}
    if not codes:
        return {}
    rows = session.query(Place).filter(Place.ref.in_(codes)).all()
    return {p.ref: p for p in rows}


def _to_entry_item(entry: TimetableEntry, venue_places: dict) -> TimetableEntryItem:
    place = venue_places.get(entry.venue_code) if entry.venue_code else None
    return TimetableEntryItem(
        id=entry.id,
        day_of_week=entry.day_of_week,
        start_time=entry.start_time,
        end_time=entry.end_time,
        module_code=entry.module_code,
        module_name=entry.module_name,
        lecturer_name=entry.lecturer_name,
        venue_code=entry.venue_code,
        venue_name=place.name if place else None,
        venue_place_id=place.id if place else None,
        is_cross_cutting=entry.is_cross_cutting,
    )


def get_next_class(
    session: Session,
    program_year_id: int,
    now: datetime | None = None,
) -> NextClassResponse:
    """
    The next class for a program-year, if it starts within the next
    90 minutes.

    Returns has_class=False when nothing is coming up. Otherwise
    includes the entry and how many seconds until it starts.

    Merging runs first, so the "next class" is a merged period, not
    a 45-minute sub-slot.
    """
    if now is None:
        now = datetime.now()

    today = now.weekday()
    tomorrow = (today + 1) % 7

    entries = (
        session.query(TimetableEntry)
        .filter_by(program_year_id=program_year_id)
        .filter(TimetableEntry.day_of_week.in_([today, tomorrow]))
        .all()
    )

    if not entries:
        return NextClassResponse(has_class=False)

    entries = _merge_adjacent(entries)
    venue_places = _venue_places_for(session, entries)

    best_entry = None
    best_delta = None

    for entry in entries:
        start_dt = _entry_start_datetime(entry, now)
        if start_dt is None:
            continue
        delta = (start_dt - now).total_seconds()
        if delta < 0:
            continue
        if delta > 90 * 60:
            continue
        if best_delta is None or delta < best_delta:
            best_delta = delta
            best_entry = entry

    if best_entry is None:
        return NextClassResponse(has_class=False)

    return NextClassResponse(
        has_class=True,
        entry=_to_entry_item(best_entry, venue_places),
        starts_in_seconds=int(best_delta),
    )


def _entry_start_datetime(entry: TimetableEntry, reference: datetime) -> datetime | None:
    """
    Convert an entry's (day_of_week, start_time) into an absolute
    datetime, relative to `reference`.
    """
    try:
        hh, mm = entry.start_time.split(":")
        h, m = int(hh), int(mm)
    except (ValueError, AttributeError):
        return None

    ref_day = reference.weekday()
    day_offset = (entry.day_of_week - ref_day) % 7

    candidate = reference.replace(hour=h, minute=m, second=0, microsecond=0) + timedelta(days=day_offset)
    return candidate