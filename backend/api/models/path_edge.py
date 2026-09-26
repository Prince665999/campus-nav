"""
path_edge.py

One row per edge in the routing graph — a segment between two OSM
nodes that a student can walk along. Together, these rows reconstruct
the graph that A* runs on.

Edges come from OSM ways tagged highway=footway or highway=path.
"""

from sqlalchemy import Float, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin


class PathEdge(Base, TimestampMixin):
    __tablename__ = "path_edges"

    id: Mapped[int] = mapped_column(primary_key=True)

    # OSM node ids at each end of the edge. These are strings because
    # OSM ids are opaque, and because re-import matches on them.
    node_a_osm: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    node_b_osm: Mapped[str] = mapped_column(String(32), nullable=False, index=True)

    # Physical length, computed once at ingest from the two endpoints.
    length_m: Mapped[float] = mapped_column(Float, nullable=False)

    # Tags pulled from the way the edge belongs to. These are what the
    # routing profiles in Phase 4 read.
    highway: Mapped[str | None] = mapped_column(String(32), nullable=True)
    surface: Mapped[str | None] = mapped_column(String(32), nullable=True)
    lit: Mapped[str | None] = mapped_column(String(16), nullable=True)
    covered: Mapped[str | None] = mapped_column(String(16), nullable=True)
    incline: Mapped[str | None] = mapped_column(String(32), nullable=True)
    wheelchair: Mapped[str | None] = mapped_column(String(16), nullable=True)
    access: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # Public description — shown to students in the app. Not fed to
    # the AI.
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # AI description — fed to the narration system. Never shown in
    # the app front end.
    description_ai: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("ix_path_edges_pair", "node_a_osm", "node_b_osm", unique=True),
    )

    def __repr__(self):
        return f"<PathEdge {self.node_a_osm}--{self.node_b_osm} {self.length_m:.1f}m>"