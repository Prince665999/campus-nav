"""
favorite.py

One row per (device, place) pair the student has starred. Unlike
recents, favorites are explicit — a place is either a favorite or it
isn't.

The unique index on (session_hash, place_id) makes "add to favorites"
idempotent: calling it twice doesn't create two rows.
"""

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin


class Favorite(Base, TimestampMixin):
    __tablename__ = "favorite_places"

    id: Mapped[int] = mapped_column(primary_key=True)

    session_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    place_id: Mapped[int] = mapped_column(
        ForeignKey("places.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Optional: which place in the list this favorite should sort at.
    # Nullable for the common case where the user doesn't reorder.
    sort_order: Mapped[int | None] = mapped_column(nullable=True)

    __table_args__ = (
        Index(
            "ix_favorite_session_place",
            "session_hash",
            "place_id",
            unique=True,
        ),
    )

    def __repr__(self):
        return f"<Favorite place_id={self.place_id}>"