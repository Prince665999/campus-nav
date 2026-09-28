"""
timetable_entry.py

One class slot. Flat structure — one row per class per day, no merged
cells, no layout quirks. The CSV import writes these, and the mobile
timetable screen reads them.

Every field on this row corresponds to a column in the timetable PDF
(or its spreadsheet source). The mapping is intentional and flat so
that reading and writing are obvious, and so that a future admin UI
can edit one field at a time without special cases.

Venue linking: `venue_code` is matched against `Place.ref` at read
time. When there's a match, the mobile app can offer "Take me there"
for that row. When there isn't (a venue that hasn't been mapped into
the places database yet), the app shows the venue text without a
navigation button. The link is not enforced by a foreign key, because
venues come and go and a mismatch should never block the timetable
from being stored.
"""

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin


# The days we accept. Stored as integers so sorting and comparison
# are trivial, and so a future change to display names doesn't touch
# the database.
DAY_MONDAY = 0
DAY_TUESDAY = 1
DAY_WEDNESDAY = 2
DAY_THURSDAY = 3
DAY_FRIDAY = 4
DAY_SATURDAY = 5
DAY_SUNDAY = 6

DAY_NAMES = {
    DAY_MONDAY: "Monday",
    DAY_TUESDAY: "Tuesday",
    DAY_WEDNESDAY: "Wednesday",
    DAY_THURSDAY: "Thursday",
    DAY_FRIDAY: "Friday",
    DAY_SATURDAY: "Saturday",
    DAY_SUNDAY: "Sunday",
}


class TimetableEntry(Base, TimestampMixin):
    __tablename__ = "timetable_entries"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Which program-year this class belongs to.
    program_year_id: Mapped[int] = mapped_column(
        ForeignKey("program_years.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Which day of the week. 0 = Monday, 4 = Friday.
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    # Start and end time, stored as "HH:MM" strings. Storing them as
    # strings (not time objects) keeps SQLite and Postgres identical
    # and avoids timezone headaches — these are local wall-clock times,
    # not instants.
    start_time: Mapped[str] = mapped_column(String(5), nullable=False)
    end_time: Mapped[str] = mapped_column(String(5), nullable=False)

    # Module identity.
    module_code: Mapped[str] = mapped_column(String(32), nullable=False)
    module_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Who teaches it. Free text — sometimes one name, sometimes two,
    # sometimes "Not Set".
    lecturer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Where it's held. Matches `Place.ref` when the venue is mapped.
    venue_code: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    # Cross-cutting courses are shared with other programs. The
    # timetable PDFs mark them with an asterisk. Kept as a flag so
    # the app can show "shared with other programs" if useful.
    is_cross_cutting: Mapped[bool] = mapped_column(Boolean, default=False)

    # Optional free-text note. Not in the PDFs, but useful for the
    # admin if a class has a special instruction ("bring your own
    # calculator", "double session").
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        # The natural key for deduplication during import. If a CSV
        # row matches on all of these, it's an update; otherwise it's
        # an insert. We deliberately don't include the module name or
        # lecturer — those can change without creating a new slot.
        Index(
            "ix_timetable_entries_natural_key",
            "program_year_id",
            "day_of_week",
            "start_time",
            "module_code",
            unique=True,
        ),
        Index(
            "ix_timetable_entries_lookup",
            "program_year_id",
            "day_of_week",
        ),
    )

    def __repr__(self):
        return (
            f"<TimetableEntry py={self.program_year_id} "
            f"day={self.day_of_week} {self.start_time}-{self.end_time} "
            f"{self.module_code}>"
        )