"""
timetable.py

Request and response shapes for the timetable endpoints.
"""

from pydantic import BaseModel


class ProgramItem(BaseModel):
    """One program, as shown in the onboarding picker."""

    id: int
    name: str
    department: str | None = None
    code: str | None = None
    level: str | None = None


class ProgramYearItem(BaseModel):
    """One year-level of one program."""

    id: int
    program_id: int
    year_number: int
    academic_year: str
    semester: int
    display_name: str | None = None


class TimetableEntryItem(BaseModel):
    """One class slot, as returned by the timetable endpoints."""

    id: int
    day_of_week: int
    start_time: str
    end_time: str
    module_code: str
    module_name: str | None = None
    lecturer_name: str | None = None
    venue_code: str | None = None
    venue_name: str | None = None          # resolved from Place, if a match
    venue_place_id: int | None = None      # for "Take me there"
    is_cross_cutting: bool = False


class TimetableWeekResponse(BaseModel):
    """The full week of entries for one program-year."""

    program_year_id: int
    entries: list[TimetableEntryItem]


class NextClassResponse(BaseModel):
    """The next class for a program-year, if any."""

    has_class: bool
    entry: TimetableEntryItem | None = None
    starts_in_seconds: int | None = None