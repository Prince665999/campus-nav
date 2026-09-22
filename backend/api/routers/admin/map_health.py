"""
map_health.py

GET /api/admin/map-health — the checks from Phase 11, exposed over HTTP.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...dependencies import db_session
from ...services.map_health_service import run_all_checks

router = APIRouter(prefix="/map-health", tags=["admin:map-health"])


@router.get("")
def get_map_health(session: Session = Depends(db_session)):
    """
    Run every map health check and return the results.

    Informational only — the endpoint always returns 200, and the
    checks never fail. The admin sees counts and examples.
    """
    report = run_all_checks(session)
    return {
        "total_issues": report.total_issues(),
        "checks": [
            {
                "key": c.key,
                "label": c.label,
                "description": c.description,
                "count": c.count,
                "items": c.items,
            }
            for c in report.checks
        ],
    }