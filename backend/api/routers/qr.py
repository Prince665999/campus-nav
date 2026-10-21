"""
qr.py

Resolves a scanned QR code to the place it stands for.

A QR code printed on a corridor wall holds a short code such as "LIB-G-03".
The phone sends that code here and gets back the place (a point on the
corridor) to start the route from. The place is an ordinary indoor place
with category "qr", created by the ingest from a `qr=<code>` tag in
final.osm.
"""

import re

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..dependencies import db_session
from ..errors import NotFoundError
from ..models.place import Place
from ..schemas.place import PlaceSummary
from ..services import place_service

router = APIRouter(prefix="/api/qr", tags=["qr"])

# Must match the rule in pipeline/ingest.py.
_CODE_RE = re.compile(r"^[A-Za-z0-9_-]{1,32}$")


@router.get("/{code}", response_model=PlaceSummary)
def resolve_qr(code: str, session: Session = Depends(db_session)):
    """Return the place a QR code stands for. 404 if the code is unknown."""
    cleaned = (code or "").strip()
    if not _CODE_RE.match(cleaned):
        raise NotFoundError(f"QR code {cleaned!r} not found")

    row = (
        session.query(Place)
        .filter(func.lower(func.coalesce(Place.ref, "")) == cleaned.lower())
        .filter(func.lower(func.trim(func.coalesce(Place.category, ""))) == "qr")
        .first()
    )
    if row is None:
        raise NotFoundError(f"QR code {cleaned!r} not found")

    return place_service._to_summary(session, row)
