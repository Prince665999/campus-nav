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
    name: str | None = Field(None, max_length=255)
    name_sw: str | None = Field(None, max_length=255)
    alt_names: str | None = None

    # Public description — shown to students in the app.
    description: str | None = None

    # AI description — fed to narration. Never shown to students.
    description_ai: str | None = None

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


class UpdateAdminUserRequest(BaseModel):
    role: str | None = Field(None, pattern="^(owner|contributor)$")
    password: str | None = Field(None, min_length=8)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    email: str = Field(..., max_length=255)
    password: str = Field(..., min_length=1)


class LoginResponse(BaseModel):
    token: str
    role: str
    expires_in_s: int


class WhoAmIResponse(BaseModel):
    user_id: int
    role: str
    email: str