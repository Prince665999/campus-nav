"""
route_cache.py

A durable companion to the Redis cache.

Redis holds the hot paths — the routes requested in the last few
minutes. This table holds the popular ones — the handful of routes
almost every student walks. When Redis restarts, its keys are gone,
but this table isn't. A pre-warm job (prewarm_routes.py) reads the
most-hit routes from here and repopulates Redis after a restart.

The `hit_count` column records how many times a route has been
requested since the row was written. The pre-warm job sorts by this
to know which routes matter most.
"""

from sqlalchemy import Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin


class RouteCache(Base, TimestampMixin):
    __tablename__ = "route_cache"

    id: Mapped[int] = mapped_column(primary_key=True)

    # The route's identity: from and to are place IDs. The profile
    # column exists for future profiles; today everything is
    # "fastest".
    start_place_id: Mapped[int] = mapped_column(Integer, nullable=False)
    end_place_id: Mapped[int] = mapped_column(Integer, nullable=False)
    profile: Mapped[str] = mapped_column(String(32), nullable=False, default="fastest")

    # The cached payload, as JSON. Same shape as /api/route returns.
    path_json: Mapped[str] = mapped_column(Text, nullable=False)

    # Route metadata, stored alongside so callers can answer questions
    # like "how long is this route" without parsing the JSON.
    distance_m: Mapped[float] = mapped_column(nullable=False)

    # How many times this row has served a request. Incremented on
    # each cache miss that gets written back. Used by the pre-warm job.
    hit_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    __table_args__ = (
        Index(
            "ix_route_cache_key",
            "start_place_id",
            "end_place_id",
            "profile",
            unique=True,
        ),
        Index("ix_route_cache_hits", "hit_count"),
    )

    def __repr__(self):
        return (
            f"<RouteCache {self.start_place_id}->{self.end_place_id} "
            f"hits={self.hit_count}>"
        )