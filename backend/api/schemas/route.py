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
    # Which world this step happens in: "outdoor" for GPS-tracked
    # surface walking, "indoor" for corridor walking inside a building.
    # The mobile app uses this to switch behavior (GPS on/off, map
    # swap, compass hide) at the handover point.
    mode: str = "outdoor"


class RouteLeg(BaseModel):
    """
    One leg of a route. A pure outdoor route has one leg. A mixed
    route has up to three: outdoor, entrance (zero-length marker),
    indoor. The mobile app can use `mode` here to decide when to swap
    its rendering.
    """

    mode: str                # "outdoor" or "indoor"
    from_m: float            # metres from the route start
    to_m: float              # metres from the route start
    distance_m: float        # to_m - from_m
    from_name: str | None = None
    to_name: str | None = None


class RouteResponse(BaseModel):
    """The shape returned by /api/route."""

    distance_m: float
    steps: list[TurnStep]
    geometry: list[LatLon]
    profile: str = "fastest"
    from_name: str
    to_name: str
    # Optional for backward compatibility: mobile apps that don't read
    # it will ignore it. Newer clients use it to switch rendering.
    legs: list[RouteLeg] | None = None


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