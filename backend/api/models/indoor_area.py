"""
indoor_area.py

A room or named area inside a building, as a polygon.

These are NOT routable — the routing endpoints are door nodes. Areas
exist so the mobile app can draw floor plans, and so an admin can
search for "Room 302" and see the room's geometry.

The `door_node_id` links the room to the door node(s) that serve it.
If a room has multiple doors, only the primary one is stored here;
the ingest can be extended later if that matters.
"""

from sqlalchemy import Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin


class IndoorArea(Base, TimestampMixin):
    __tablename__ = "indoor_areas"

    id: Mapped[int] = mapped_column(primary_key=True)

    # OSM identity of the polygon way
    osm_type: Mapped[str] = mapped_column(String(16), nullable=False)  # "way"
    osm_id: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    ref: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # The floor the room is on, e.g. "0", "1", "-1".
    level: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)

    # WKT "POLYGON((lon lat, ...))"
    geometry_wkt: Mapped[str] = mapped_column(Text, nullable=False)

    # The door node that opens into this room, if any. Matches
    # Place.osm_id for the corresponding indoor Place row.
    door_node_id: Mapped[str | None] = mapped_column(
        String(32), nullable=True, index=True
    )

    __table_args__ = (
        Index("ix_indoor_areas_name_lower", name),
        Index("ix_indoor_areas_level", level),
        Index("ix_indoor_areas_osm_id", osm_id),
    )

    def __repr__(self):
        return f"<IndoorArea id={self.id} name={self.name!r} level={self.level!r}>"