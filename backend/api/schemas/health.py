"""
health.py

Response shapes for /api/health.
"""

from pydantic import BaseModel


class DependencyStatus(BaseModel):
    """One dependency and whether it's healthy."""

    name: str
    ok: bool
    detail: str | None = None


class HealthResponse(BaseModel):
    """The full health payload."""

    status: str  # "ok", "degraded", "down"
    version: str
    environment: str
    uptime_s: float

    # Graph info
    graph_version: str
    node_count: int
    edge_count: int

    # Data counts
    place_count: int
    area_count: int

    # Dependencies
    dependencies: list[DependencyStatus]