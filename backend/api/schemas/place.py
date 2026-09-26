"""
place.py

Request and response shapes for the places endpoints.
"""

from pydantic import BaseModel, ConfigDict, Field

from .common import LatLon


class PlaceSummary(BaseModel):
    """The shape returned by /api/places/search and /api/places."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    name_sw: str | None = None
    category: str | None = None
    location: LatLon
    is_landmark: bool = False


class PlaceDetail(BaseModel):
    """The shape returned by /api/places/{id}. Adds fields the summary
    doesn't need.

    Note: the `description` here is the public one, read from the
    database's `description` column. The AI-facing description lives
    under `description_ai` and is never returned in a public response.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    name_sw: str | None = None
    alt_names: str | None = None
    description: str | None = None
    category: str | None = None
    ref: str | None = None
    location: LatLon
    wheelchair: str | None = None
    opening_hours: str | None = None
    is_landmark: bool = False
    has_wifi: bool = False
    wifi_ssid: str | None = None


class PlaceListParams(BaseModel):
    """Query params for /api/places."""

    q: str | None = None
    category: str | None = None
    lat: float | None = Field(None, ge=-90, le=90)
    lon: float | None = Field(None, ge=-180, le=180)
    radius_m: float = Field(500, gt=0, le=5000)
    limit: int = Field(50, gt=0, le=200)