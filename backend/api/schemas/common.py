"""
common.py

Shared Pydantic models used by more than one router. Keep this file
small — endpoint-specific shapes belong in their own schema file.
"""

from pydantic import BaseModel, Field


class LatLon(BaseModel):
    """A coordinate pair. Used by place detail and route geometry."""

    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)


class ErrorResponse(BaseModel):
    """Every error response the API returns looks like this."""

    detail: str
    code: str | None = None


class Paginated(BaseModel):
    """Wraps list responses so pagination can be added later without
    breaking clients."""

    total: int
    items: list