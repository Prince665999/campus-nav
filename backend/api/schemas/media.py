"""
media.py

Request and response shapes for the media endpoints.
"""

from pydantic import BaseModel, Field


class MediaItem(BaseModel):
    """One photo as returned by the API."""

    id: int
    place_id: int
    kind: str
    bearing_deg: int | None = None
    credit: str | None = None
    is_primary: bool = False
    sort_order: int = 0

    # Absolute URLs for each size variant. All three are returned so
    # the client can pick the right one for the layout.
    url_thumb: str
    url_card: str
    url_full: str


class MediaUploadResponse(BaseModel):
    """Returned by POST /api/media."""

    id: int
    place_id: int
    kind: str
    url_card: str


class MediaUploadMeta(BaseModel):
    """Form metadata accompanying a photo upload."""

    place_id: int
    kind: str = Field("approach", pattern="^(approach|entrance|detail)$")
    bearing_deg: int | None = Field(None, ge=0, le=360)
    credit: str | None = None
    is_primary: bool = False
    sort_order: int = 0