"""
health.py

Request and response shapes for /api/health.
"""

from pydantic import BaseModel


class HealthResponse(BaseModel):
    """Returned by GET /api/health."""

    status: str           # "ok" or "degraded"
    graph_version: str
    node_count: int
    edge_count: int
    place_count: int
    area_count: int
    uptime_s: float