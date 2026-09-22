"""
stats.py

GET /api/admin/stats — the numbers the dashboard needs.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ...dependencies import db_session
from ...models.area import Area
from ...models.media import Media
from ...models.path_edge import PathEdge
from ...models.place import Place
from ...models.report import Report
from ...schemas.admin import AdminStats

router = APIRouter(prefix="/stats", tags=["admin:stats"])


@router.get("", response_model=AdminStats)
def get_stats(session: Session = Depends(db_session)):
    """Aggregate counts for the admin dashboard."""

    def count(model, filter_=None):
        q = session.query(func.count(model.id))
        if filter_ is not None:
            q = q.filter(filter_)
        return q.scalar() or 0

    return AdminStats(
        place_count=count(Place),
        area_count=count(Area),
        edge_count=count(PathEdge),
        media_count=count(Media),
        report_count=count(Report),
        reports_new=count(Report, Report.status == "new"),
        reports_in_progress=count(Report, Report.status == "in_progress"),
        reports_resolved=count(Report, Report.status == "resolved"),
    )