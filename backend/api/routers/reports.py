"""
reports.py

POST /api/reports — create a student report.
"""

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.orm import Session

from ..dependencies import db_session
from ..errors import BadRequestError
from ..rate_limit import limiter
from ..schemas.report import CreateReportRequest, ReportResponse
from ..security import hash_device_id
from ..services import report_service
from ..settings import RATE_LIMIT_REPORTS

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _require_device_id(x_device_id: str | None = Header(None)) -> str:
    if not x_device_id:
        raise BadRequestError("X-Device-Id header is required.")
    return hash_device_id(x_device_id)


@router.post("", response_model=ReportResponse, status_code=201)
@limiter.limit(RATE_LIMIT_REPORTS)
def create_report(
    request: Request,
    body: CreateReportRequest,
    session: Session = Depends(db_session),
    session_hash: str = Depends(_require_device_id),
):
    """
    Create a report. Used by the mobile app when a student flags a
    problem, and by the arrival screen for helpful/not-helpful
    feedback.
    """
    try:
        return report_service.create_report(
            session,
            session_hash=session_hash,
            kind=body.kind,
            body=body.body,
            place_id=body.place_id,
            edge_id=body.edge_id,
            photo_url=body.photo_url,
        )
    except ValueError as e:
        raise BadRequestError(str(e)) from e