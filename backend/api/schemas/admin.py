"""
admin.py

Request and response shapes for admin endpoints.
"""

from datetime import datetime

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

class AdminStats(BaseModel):
    """Everything the dashboard needs at a glance."""

    place_count: int
    area_count: int
    edge_count: int
    media_count: int
    report_count: int
    reports_new: int
    reports_in_progress: int
    reports_resolved: int


# ---------------------------------------------------------------------------
# Place editing
# ---------------------------------------------------------------------------

class UpdatePlaceRequest(BaseModel):
    """Fields the admin can edit. All optional — only what's sent
    is changed."""

    name: str | None = Field(None, max_length=255)
    name_sw: str | None = Field(None, max_length=255)
    alt_names: str | None = None
    description: str | None = None
    category: str | None = Field(None, max_length=64)
    ref: str | None = Field(None, max_length=64)
    wheelchair: str | None = Field(None, max_length=16)
    opening_hours: str | None = Field(None, max_length=255)
    is_landmark: bool | None = None
    has_wifi: bool | None = None
    wifi_ssid: str | None = Field(None, max_length=128)
    wifi_password: str | None = Field(None, max_length=128)


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

class UpdateReportStatusRequest(BaseModel):
    status: str = Field(..., pattern="^(new|in_progress|resolved)$")


class AdminReportItem(BaseModel):
    """A report as the admin site sees it — includes the place name
    and the raw session hash."""

    id: int
    kind: str
    status: str
    body: str | None = None
    photo_url: str | None = None
    place_id: int | None = None
    place_name: str | None = None
    edge_id: int | None = None
    session_hash: str
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Re-import
# ---------------------------------------------------------------------------

class ReimportDiff(BaseModel):
    """What would change if a re-import ran now."""

    places_added: int
    places_updated: int
    places_unchanged: int
    areas_added: int
    areas_updated: int
    areas_unchanged: int
    edges_added: int
    edges_updated: int
    edges_unchanged: int
    sample_changes: list = Field(default_factory=list)


class ReimportResult(BaseModel):
    """What a re-import actually did."""

    places_added: int
    places_updated: int
    places_unchanged: int
    areas_added: int
    areas_updated: int
    areas_unchanged: int
    edges_added: int
    edges_updated: int
    edges_unchanged: int


# ---------------------------------------------------------------------------
# Admin users
# ---------------------------------------------------------------------------

class AdminUserItem(BaseModel):
    id: int
    email: str
    role: str
    created_at: datetime


class CreateAdminUserRequest(BaseModel):
    email: str = Field(..., max_length=255)
    role: str = Field("contributor", pattern="^(owner|contributor)$")
    password: str = Field(..., min_length=8)