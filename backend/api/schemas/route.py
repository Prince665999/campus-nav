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

    # For indoor steps:
    #   geometry_index — the position in the route's `geometry` array
    #                    where this step's node sits. Lets the phone
    #                    draw a "you are here" marker on the floor plan.
    #   level          — the floor the step is on ("0", "1", "-1").
    #                    The phone uses this to fetch the right floor
    #                    plan and switch when the student takes stairs.
    #   building_name  — which building the step is in. The phone sends
    #                    this as a query param to /api/indoor/areas.
    # Null for outdoor steps.
    geometry_index: int | None = None
    level: str | None = None
    building_name: str | None = None


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

    # The list of merged-graph node ids walked, in order. Outdoor
    # nodes are prefixed with 'o'; indoor nodes are not. Not part of
    # the public mobile API — the mobile client ignores it — but the
    # narration service reads it to split the route into runs and
    # narrate each with the right engine. Optional so old clients
    # don't break.
    node_path: list[str] | None = None


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