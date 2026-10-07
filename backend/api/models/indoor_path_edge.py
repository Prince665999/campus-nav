"""
indoor_path_edge.py

One row per edge in the indoor routing graph — a segment between two
indoor nodes (doors, corridor junctions, stair endpoints) that a
student can walk along.

Edges come from indoor ways tagged highway=footway, highway=corridor,
or highway=steps. The `kind` column distinguishes walking edges from
stairs.

Not read during routing — the indoor engine reads final.osm directly
and builds its graph in memory. This table exists so admins can
inspect indoor path data the same way they inspect outdoor path data,
and so future health checks have something to query.
"""

from sqlalchemy import Boolean, Float, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin


class IndoorPathEdge(Base, TimestampMixin):
    __tablename__ = "indoor_path_edges"

    id: Mapped[int] = mapped_column(primary_key=True)

    # OSM node ids at each end of the edge.
    node_a_osm: Mapped[str] = mapped_column(
        String(32), nullable=False, index=True
    )
    node_b_osm: Mapped[str] = mapped_column(
        String(32), nullable=False, index=True
    )

    # Physical length, computed once at ingest.
    length_m: Mapped[float] = mapped_column(Float, nullable=False)

    # The way's highway tag: "footway", "corridor", "path", or "steps".
    highway: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # The level this edge is on. For stairs, "0;1" means it connects
    # those two levels. For corridors, a single value like "0".
    level: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)

    # "walk" for ordinary edges, "stairs" for steps. Matches the
    # `kind` field the frozen indoor engine uses at routing time.
    kind: Mapped[str] = mapped_column(
        String(16), nullable=False, default="walk", index=True
    )

    # Whether the way this edge belongs to is tagged corridor=yes.
    # Used by the narration to decide whether to say "the corridor".
    corridor: Mapped[bool] = mapped_column(Boolean, default=False)

    # Optional description, if the way has a description tag.
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index(
            "ix_indoor_path_edges_pair",
            "node_a_osm",
            "node_b_osm",
            unique=True,
        ),
    )

    def __repr__(self):
        return (
            f"<IndoorPathEdge {self.node_a_osm}--{self.node_b_osm} "
            f"{self.length_m:.1f}m {self.kind}>"
        )