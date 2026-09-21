"""
media.py

One row per uploaded photo. Photos are associated with a place (a
named point) and stored as three files on disk — thumb, card, full.

The `bearing_deg` column matters: it's the compass direction the
camera was facing when the photo was taken. The mobile app uses it
to show the photo that matches the direction the student is
approaching from. This is the detail that makes recognition much
easier and almost nobody implements.
"""

from sqlalchemy import ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin


class Media(Base, TimestampMixin):
    __tablename__ = "media"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Which place this photo belongs to. Areas (polygons) aren't
    # supported yet — when Phase 14's admin editor adds them, this
    # becomes a nullable column alongside area_id.
    place_id: Mapped[int] = mapped_column(
        ForeignKey("places.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Where the files live, relative to MEDIA_DIR. The service builds
    # the full path by joining MEDIA_DIR / <stored_path_prefix> / <variant>.webp.
    # We store one prefix and derive three files from it.
    stored_path_prefix: Mapped[str] = mapped_column(String(255), nullable=False)

    # What kind of photo this is. "approach" is the one from the main
    # footpath, "entrance" is a close-up of the door, "detail" is
    # anything else (interior, signage, artwork).
    kind: Mapped[str] = mapped_column(String(32), nullable=False, default="approach")

    # Compass direction the camera was facing, 0..360. Nullable for
    # the rare case where the uploader genuinely doesn't know.
    bearing_deg: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Free-text credit line, for photos not taken by the team.
    credit: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Shown first in the carousel when true. Only one per place should
    # be primary; the admin editor in Phase 14 enforces this.
    is_primary: Mapped[bool] = mapped_column(default=False)

    # Sort order within a place's carousel.
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    __table_args__ = (
        Index("ix_media_place_primary", "place_id", "is_primary"),
    )

    def __repr__(self):
        return f"<Media id={self.id} place_id={self.place_id} kind={self.kind!r}>"