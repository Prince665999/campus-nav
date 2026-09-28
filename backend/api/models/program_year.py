"""
program_year.py

One year-level of one program. This is the unit that actually has a
timetable. A student selects "Program X, Year 2" and gets the
timetable attached to this row.

Why a separate table and not just a "year" column on Program: because
each year level has its own independent timetable. The First Year of
a program shares modules with the First Year of a different program;
the Second Year doesn't. Storing them separately means a reimport of
one year's timetable can't corrupt another's.

The `academic_year` and `semester` fields exist so we can keep old
timetables around when a new academic year starts. The student always
sees the current one; the admin can look back at previous ones.
"""

from sqlalchemy import ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin


class ProgramYear(Base, TimestampMixin):
    __tablename__ = "program_years"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Which program this year belongs to.
    program_id: Mapped[int] = mapped_column(
        ForeignKey("programs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Which year level. Typically 1, 2, 3, 4.
    year_number: Mapped[int] = mapped_column(Integer, nullable=False)

    # The academic year, e.g. "2025-2026". Free-form string so the
    # exact format can vary by institution.
    academic_year: Mapped[str] = mapped_column(String(16), nullable=False)

    # Which semester. Typically 1 or 2.
    semester: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # Optional display name — used on the mobile picker if we want
    # to show "Second Year" instead of "Year 2". Leave null to fall
    # back to "Year {year_number}".
    display_name: Mapped[str | None] = mapped_column(String(64), nullable=True)

    __table_args__ = (
        Index(
            "ix_program_years_unique",
            "program_id",
            "year_number",
            "academic_year",
            "semester",
            unique=True,
        ),
    )

    def __repr__(self):
        return (
            f"<ProgramYear program_id={self.program_id} "
            f"year={self.year_number} {self.academic_year} S{self.semester}>"
        )