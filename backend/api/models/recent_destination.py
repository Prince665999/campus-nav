"""
recent_destination.py

One row per (device, place) pair that the student has recently
navigated to. Updated on arrival, or when the student taps a place and
starts a route. The Home screen shows the N most recent.

The `last_visited_at` timestamp is what orders them. Upsert on
(session_hash, place_id) so a place visited twice appears once with a
fresh timestamp — not twice.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin


class RecentDestination(Base, TimestampMixin):
    __tablename__ = "recent_destinations"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Hashed device ID. See security.py — never the raw ID.
    session_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    place_id: Mapped[int] = mapped_column(
        ForeignKey("places.id", ondelete="CASCADE"),
        nullable=False,
    )

    last_visited_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )

    __table_args__ = (
        # One row per (device, place) — upsert updates the timestamp.
        Index(
            "ix_recent_session_place",
            "session_hash",
            "place_id",
            unique=True,
        ),
    )

    def __repr__(self):
        return f"<RecentDestination place_id={self.place_id} at={self.last_visited_at}>"