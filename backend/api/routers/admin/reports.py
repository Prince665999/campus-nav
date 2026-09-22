"""
reports.py

Admin endpoints for triaging student reports.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ...dependencies import db_session
from ...errors import BadRequestError, NotFoundError
from ...models.place import Place
from ...models.report import Report
from ...schemas.admin import AdminReportItem, UpdateReportStatusRequest
from ...services import report_service

router = APIRouter(prefix="/reports", tags=["admin:reports"])


def _to_item(report: Report, place_name: str | None) -> AdminReportItem:
    return AdminReportItem(
        id=report.id,
        kind=report.kind,
        status=report.status,
        body=report.body,
        photo_url=report.photo_url,
        place_id=report.place_id,
        place_name=place_name,
        edge_id=report.edge_id,
        session_hash=report.session_hash,
        created_at=report.created_at,
        updated_at=report.updated_at,
    )


@router.get("", response_model=list[AdminReportItem])
def list_reports(
    status: str | None = Query(None),
    kind: str | None = Query(None),
    limit: int = Query(200, gt=0, le=1000),
    session: Session = Depends(db_session),
):
    """List reports, newest first, with optional filters."""
    reports = report_service.list_reports(
        session, status=status, kind=kind, limit=limit
    )

    # Bulk-fetch place names in one query rather than N queries.
    place_ids = {r.place_id for r in reports if r.place_id}
    places = {}
    if place_ids:
        for p in session.query(Place).filter(Place.id.in_(place_ids)).all():
            places[p.id] = p.name

    return [_to_item(r, places.get(r.place_id)) for r in reports]


@router.patch("/{report_id}", response_model=AdminReportItem)
def update_report_status(
    report_id: int,
    body: UpdateReportStatusRequest,
    session: Session = Depends(db_session),
):
    """Change a report's status. new → in_progress → resolved."""
    try:
        ok = report_service.update_status(session, report_id, body.status)
    except ValueError as e:
        raise BadRequestError(str(e)) from e

    if not ok:
        raise NotFoundError(f"Report {report_id} not found")

    report = session.query(Report).filter_by(id=report_id).one()
    place_name = None
    if report.place_id:
        p = session.query(Place).filter_by(id=report.place_id).one_or_none()
        if p:
            place_name = p.name

    return _to_item(report, place_name)