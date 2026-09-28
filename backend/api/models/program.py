"""
program.py

A degree or diploma program offered by a department. This is what a
student picks during onboarding: "Diploma in Electrical and Electronic
Engineering", "Bachelor of Electrical and Electronic Engineering",
etc.

Programs are what timetables hang off. Each program has one or more
year levels, and each year level has its own timetable.

Programs are always created by an admin — either through the CLI
import script or (later) through the admin site. There's no public
API to create them.
"""

from sqlalchemy import Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin


class Program(Base, TimestampMixin):
    __tablename__ = "programs"

    id: Mapped[int] = mapped_column(primary_key=True)

    # The program's full name, as it appears on the timetable.
    # e.g. "Diploma in Electrical and Electronic Engineering"
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    # The department that offers the program.
    # e.g. "Electrical and Power Engineering"
    department: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # A short code, useful for display and for the CSV import.
    # e.g. "DEEE" (Diploma in Electrical and Electronic Engineering)
    code: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # Which academic level this belongs to.
    # Free text for now — values seen in the wild: "UQF6", "UQF8".
    # Not enforced because different institutions use different schemes.
    level: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # Optional notes, for the admin's own reference.
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("ix_programs_name_lower", name),
        Index("ix_programs_code", code),
    )

    def __repr__(self):
        return f"<Program id={self.id} name={self.name!r}>"