"""
place.py

A named point on the campus map — a building entrance, an office door,
a gate, a specific room. This is what routing can start from and end at.

Points come from OSM nodes with a `name` tag. Areas (polygons) live in
a separate table because they are walked past, not routed to.
"""

from sqlalchemy import Float, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin


class Place(Base, TimestampMixin):
    __tablename__ = "places"

    id: Mapped[int] = mapped_column(primary_key=True)

    # OSM identity — used to match on re-import
    osm_type: Mapped[str] = mapped_column(String(16), nullable=False)  # "node"
    osm_id: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)

    # Names
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    name_sw: Mapped[str | None] = mapped_column(String(255), nullable=True)
    alt_names: Mapped[str | None] = mapped_column(Text, nullable=True)  # semicolon-separated

    # Description — OSM-sourced initially, editable by hand later
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Coordinates. Kept as separate lat/lon columns for ease of read;
    # Phase 13 adds a proper geometry column alongside these.
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)

    # Categorisation
    category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ref: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Accessibility / hours
    wheelchair: Mapped[str | None] = mapped_column(String(16), nullable=True)
    opening_hours: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Flags
    is_landmark: Mapped[bool] = mapped_column(default=False)
    has_wifi: Mapped[bool] = mapped_column(default=False)
    wifi_ssid: Mapped[str | None] = mapped_column(String(128), nullable=True)
    wifi_password: Mapped[str | None] = mapped_column(String(128), nullable=True)

    __table_args__ = (
        Index("ix_places_name_lower", func.lower(name)),
        Index("ix_places_category", category),
        Index("ix_places_osm_id", osm_id),
    )

    def __repr__(self):
        return f"<Place id={self.id} name={self.name!r}>"