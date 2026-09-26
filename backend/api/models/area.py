"""
area.py

A named polygon on the campus map — a building, a field, a forest, a
parking plot. Areas are not routable: you can't start or end a route at
the centroid of a building. They exist so the narration can say "you'll
pass the Library on your right".

Areas come from OSM ways with a `name` tag and at least three nodes.
"""

from sqlalchemy import Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin


class Area(Base, TimestampMixin):
    __tablename__ = "areas"

    id: Mapped[int] = mapped_column(primary_key=True)

    osm_type: Mapped[str] = mapped_column(String(16), nullable=False)  # "way"
    osm_id: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    name_sw: Mapped[str | None] = mapped_column(String(255), nullable=True)
    alt_names: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Public description — shown to students in the app. Formal text
    # written by an admin. Not fed to the AI.
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # AI description — fed to the narration system. Informal text
    # that mentions landmarks, local nicknames, "the big mango tree".
    # Never shown in the app front end.
    description_ai: Mapped[str | None] = mapped_column(Text, nullable=True)

    category: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # WKT "POLYGON((lon lat, ...))" — Phase 13 changes this column to a
    # real geometry type in Postgres, but nothing that reads it changes.
    geometry_wkt: Mapped[str] = mapped_column(Text, nullable=False)

    # Whether this area should be mentioned in narration. Phase 4 can
    # filter on this; Phase 8's admin editor can flip it.
    is_landmark: Mapped[bool] = mapped_column(default=True)

    __table_args__ = (
        Index("ix_areas_name_lower", func.lower(name)),
        Index("ix_areas_osm_id", osm_id),
    )

    def __repr__(self):
        return f"<Area id={self.id} name={self.name!r}>"