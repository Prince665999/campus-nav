"""
route.py

Request and response shapes for the routing endpoints.
"""

from pydantic import BaseModel, Field

from .common import LatLon


class TurnStep(BaseModel):
    """One step in the turn-by-turn list."""

    kind: str
    instruction: str
    at_m: float
    distance_m: float


class RouteResponse(BaseModel):
    """The shape returned by /api/route."""

    distance_m: float
    steps: list[TurnStep]
    geometry: list[LatLon]
    profile: str = "fastest"
    from_name: str
    to_name: str


class RouteParams(BaseModel):
    """Query params for /api/route. Either from_place_id or from_lat/lon
    must be given; same for the to_ side."""

    from_place_id: int | None = None
    from_lat: float | None = Field(None, ge=-90, le=90)
    from_lon: float | None = Field(None, ge=-180, le=180)
    to_place_id: int | None = None
    to_lat: float | None = Field(None, ge=-90, le=90)
    to_lon: float | None = Field(None, ge=-180, le=180)
    profile: str = "fastest"