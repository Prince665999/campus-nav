"""
report_service.py

Create and list reports. The list side is used by Phase 11's CLI and
Phase 14's admin queue; the create side is used by the mobile app.
"""

from sqlalchemy.orm import Session

from backend.api.models.report import (
    ALL_KINDS,
    FEEDBACK_KINDS,
    Report,
)
from backend.api.schemas.report import ReportResponse


def create_report(
    session: Session,
    session_hash: str,
    kind: str,
    body: str | None = None,
    place_id: int | None = None,
    edge_id: int | None = None,
    photo_url: str | None = None,
) -> ReportResponse:
    """
    Create a report. Raises ValueError for an invalid kind.

    Feedback kinds (helpful, not_helpful) are created already
    resolved — there's nothing to triage.
    """
    if kind not in ALL_KINDS:
        raise ValueError(f"Unknown report kind: {kind}")

    status = "resolved" if kind in FEEDBACK_KINDS else "new"

    report = Report(
        session_hash=session_hash,
        kind=kind,
        body=body,
        place_id=place_id,
        edge_id=edge_id,
        photo_url=photo_url,
        status=status,
    )
    session.add(report)
    session.flush()

    return ReportResponse(
        id=report.id,
        kind=report.kind,
        status=report.status,
        created_at=report.created_at,
    )


def list_reports(
    session: Session,
    status: str | None = None,
    kind: str | None = None,
    limit: int = 100,
) -> list[Report]:
    """
    List reports for the admin queue. Not exposed to students —
    only Phase 11's CLI and Phase 14's admin site call this.
    """
    query = session.query(Report)

    if status:
        query = query.filter(Report.status == status)
    if kind:
        query = query.filter(Report.kind == kind)

    return query.order_by(Report.created_at.desc()).limit(limit).all()


def update_status(session: Session, report_id: int, status: str) -> bool:
    """
    Move a report to a new status. Returns True if the report existed.
    """
    if status not in {"new", "in_progress", "resolved"}:
        raise ValueError(f"Invalid status: {status}")

    report = session.query(Report).filter_by(id=report_id).one_or_none()
    if report is None:
        return False
    report.status = status
    return True