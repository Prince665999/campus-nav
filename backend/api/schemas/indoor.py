"""
indoor.py

Request and response shapes for the indoor-areas endpoint.

The endpoint returns plain JSON with lat/lon boundary points, not
WKT strings. The phone builds GeoJSON from this directly.

The `levels` array lists every level that has polygons in this
building. The floor switcher uses it to know what to show. It's
computed from the DB, not hard-coded, so it always reflects what's
actually ingested.
"""

from pydantic import BaseModel, Field

from .common import LatLon


class IndoorAreaItem(BaseModel):
    """One room or corridor on a floor plan."""

    id: int
    osm_id: str
    name: str | None = None
    ref: str | None = None
    type: str  # "room" or "corridor"
    level: str | None = None
    door_node_id: str | None = None

    # The polygon outline, as a list of lat/lon points.
    boundary: list[LatLon]

    # A single representative point. Used to place the name label.
    centroid: LatLon


class IndoorAreasResponse(BaseModel):
    """Everything the phone needs to draw one floor of one building."""

    building_name: str
    level: str
    areas: list[IndoorAreaItem] = Field(default_factory=list)

    # Every level this building has polygons on, sorted ascending.
    # Includes the requested level. Used by the floor switcher.
    levels: list[str] = Field(default_factory=list)