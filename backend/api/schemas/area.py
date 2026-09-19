"""
area.py

Request and response shapes for area (polygon) endpoints.

Areas are used internally by the narration service, which reads them
from graph_service — not from the database. But the mobile map and
the admin editor both want to render and edit polygons, so this
schema gives them a stable response shape.
"""

from pydantic import BaseModel, Field

from .common import LatLon


class AreaSummary(BaseModel):
    """Minimal shape for rendering a polygon on a map."""

    id: int
    name: str
    name_sw: str | None = None
    category: str | None = None
    boundary: list[LatLon]
    centroid: LatLon
    is_landmark: bool = False


class AreaDetail(BaseModel):
    """Full detail for the admin editor."""

    id: int
    name: str
    name_sw: str | None = None
    alt_names: str | None = None
    description: str | None = None
    category: str | None = None
    boundary: list[LatLon]
    centroid: LatLon
    is_landmark: bool = False


class AreaListParams(BaseModel):
    """Query params for /api/areas."""

    q: str | None = None
    category: str | None = None
    landmark_only: bool = False
    limit: int = Field(100, gt=0, le=500)