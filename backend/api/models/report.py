"""
report.py

A student-submitted problem report. Reports go into the admin queue
that Phase 11's CLI script lists and Phase 14's report queue page
triages.

Two shapes of report:
  - A problem: wrong direction, blocked path, bad photo, etc.
  - Feedback: "helpful" or "not helpful" on the arrival screen.

Both are stored in the same table with different `kind` values.
Feedback rows are terminal — they don't need triage. Problem reports
move through new → in_progress → resolved.
"""

from sqlalchemy import ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin


# Problem kinds — these need triage.
PROBLEM_KINDS = {
    "wrong_name",       # place is named wrong
    "missing_path",     # a footpath on the ground isn't on the map
    "blocked",          # a path is blocked (construction, closed gate)
    "bad_photo",        # a photo is wrong, upside-down, or unhelpful
    "wrong_direction",  # turn-by-turn or narration said the wrong thing
    "missing_place",    # a place exists but isn't on the map
    "incorrect_info",   # hours, accessibility, or description is wrong
    "other",
}

# Feedback kinds — terminal, no triage needed.
FEEDBACK_KINDS = {
    "helpful",
    "not_helpful",
}

ALL_KINDS = PROBLEM_KINDS | FEEDBACK_KINDS

STATUSES = {"new", "in_progress", "resolved"}


class Report(Base, TimestampMixin):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Who reported it. Same anonymous hashing as favorites and recents.
    session_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    # What it's about. At least one of these should be set, but we
    # don't enforce it in the schema because feedback rows have
    # neither — they're about the arrival, not a specific place or
    # edge.
    place_id: Mapped[int | None] = mapped_column(
        ForeignKey("places.id", ondelete="SET NULL"),
        nullable=True,
    )
    edge_id: Mapped[int | None] = mapped_column(
        ForeignKey("path_edges.id", ondelete="SET NULL"),
        nullable=True,
    )

    kind: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Path to an uploaded photo, if the student attached one.
    # Phase 14's report queue displays it; the mobile app doesn't
    # currently offer photo attachment (that's a nice-to-have for a
    # later phase).
    photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="new",
        index=True,
    )

    __table_args__ = (
        Index("ix_report_status_created", "status", "created_at"),
    )

    def __repr__(self):
        return f"<Report id={self.id} kind={self.kind!r} status={self.status!r}>"