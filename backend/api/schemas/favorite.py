"""
favorite.py

Request and response shapes for favorites and recents.
"""

from datetime import datetime

from pydantic import BaseModel

from .common import LatLon


class DestinationItem(BaseModel):
    """One row in the recent or favorite list."""

    place_id: int
    name: str
    name_sw: str | None = None
    category: str | None = None
    location: LatLon

    # For recents only. None for favorites.
    last_visited_at: datetime | None = None

    # For favorites only. None for recents.
    added_at: datetime | None = None


class AddFavoriteRequest(BaseModel):
    """POST body for adding a favorite."""

    place_id: int


class RecordRecentRequest(BaseModel):
    """POST body for recording a recent visit."""

    place_id: int