"""
report.py

Request and response shapes for reports.
"""

from datetime import datetime

from pydantic import BaseModel, Field

from ..models.report import ALL_KINDS


class CreateReportRequest(BaseModel):
    """POST body for creating a report."""

    kind: str = Field(..., description=f"One of: {', '.join(sorted(ALL_KINDS))}")
    body: str | None = Field(None, max_length=2000)
    place_id: int | None = None
    edge_id: int | None = None
    photo_url: str | None = None


class ReportResponse(BaseModel):
    """The shape returned after creating a report."""

    id: int
    kind: str
    status: str
    created_at: datetime