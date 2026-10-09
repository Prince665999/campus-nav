"""
indoor_area.py

A room or corridor inside a building, as a polygon.

These are NOT routable — the routing endpoints are door nodes.
Areas exist so the mobile app can draw floor plans, and so an admin
can search for "Room 302" and see the room's geometry.

Two kinds of polygon live here:
  - type="room"     — a room, tagged indoor=room in JOSM
  - type="corridor" — a corridor, tagged indoor=corridor in JOSM

Both are drawn on the mobile floor plan. Rooms are filled light grey,
corridors a slightly different shade so the student can see the
walkable space.

The `door_node_id` links a room to the door node(s) that serve it.
For corridors, it's null — corridors have no single door.

The `building_name` links a polygon to its building. It's a string
tag you add in JOSM on every indoor=room and indoor=corridor way.
The phone sends it as a query param to fetch one building's floor.
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

    # Which floor the polygon is on, e.g. "0", "1", "-1".
    level: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)

    # Which building it belongs to. Free text, matches the building_name
    # tag you add in JOSM. The phone queries by this + level.
    building_name: Mapped[str | None] = mapped_column(
        String(255), nullable=True, index=True
    )

    # "room" or "corridor". Rooms are filled grey, corridors a lighter
    # shade. Both are drawn.
    type: Mapped[str] = mapped_column(
        String(16), nullable=False, default="room", index=True
    )

    # WKT "POLYGON((lon lat, ...))"
    geometry_wkt: Mapped[str] = mapped_column(Text, nullable=False)

    # The door node that opens into this room, if any. Null for corridors.
    door_node_id: Mapped[str | None] = mapped_column(
        String(32), nullable=True, index=True
    )

    __table_args__ = (
        Index("ix_indoor_areas_name_lower", name),
        Index("ix_indoor_areas_level", level),
        Index("ix_indoor_areas_osm_id", osm_id),
        Index("ix_indoor_areas_building_name", building_name),
        Index("ix_indoor_areas_type", type),
    )

    def __repr__(self):
        return (
            f"<IndoorArea id={self.id} name={self.name!r} "
            f"level={self.level!r} building={self.building_name!r}>"
        )