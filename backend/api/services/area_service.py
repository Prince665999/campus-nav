"""
area_service.py

Read and edit the areas table. Used by /api/areas and later by the
admin editor. Reads from the database (not from graph_service) so
that manual edits to descriptions and landmark flags survive.
"""

import re
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.area import Area
from ..schemas.area import AreaDetail, AreaSummary
from ..schemas.common import LatLon


_WKT_POINT = re.compile(r"(-?\d+\.?\d*)\s+(-?\d+\.?\d*)")


def _parse_wkt_polygon(wkt: str) -> list[LatLon]:
    """Extract the ring coordinates from a POLYGON WKT string. Returns
    a list of LatLon with the closing point removed (if present)."""
    inner = wkt
    if inner.startswith("POLYGON(("):
        inner = inner[len("POLYGON(("):]
    if inner.endswith("))"):
        inner = inner[:-2]

    points = []
    for lon_s, lat_s in _WKT_POINT.findall(inner):
        points.append(LatLon(lat=float(lat_s), lon=float(lon_s)))

    # Remove the closing point if it equals the first.
    if len(points) > 1 and points[0] == points[-1]:
        points = points[:-1]
    return points


def _centroid(boundary: list[LatLon]) -> LatLon:
    if not boundary:
        return LatLon(lat=0.0, lon=0.0)
    lat = sum(p.lat for p in boundary) / len(boundary)
    lon = sum(p.lon for p in boundary) / len(boundary)
    return LatLon(lat=lat, lon=lon)


def _to_summary(area: Area) -> AreaSummary:
    boundary = _parse_wkt_polygon(area.geometry_wkt)
    return AreaSummary(
        id=area.id,
        name=area.name,
        name_sw=area.name_sw,
        category=area.category,
        boundary=boundary,
        centroid=_centroid(boundary),
        is_landmark=area.is_landmark,
    )


def _to_detail(area: Area) -> AreaDetail:
    summary = _to_summary(area)
    return AreaDetail(
        id=summary.id,
        name=summary.name,
        name_sw=summary.name_sw,
        alt_names=area.alt_names,
        # Public description only. The AI description
        # (`area.description_ai`) is never returned here.
        description=area.description,
        category=summary.category,
        boundary=summary.boundary,
        centroid=summary.centroid,
        is_landmark=summary.is_landmark,
    )


def list_areas(
    session: Session,
    q: str | None = None,
    category: str | None = None,
    landmark_only: bool = False,
    limit: int = 100,
) -> list[AreaSummary]:
    """List areas, optionally filtered."""
    query = session.query(Area)

    if q:
        like = f"%{q.lower()}%"
        query = query.filter(func.lower(Area.name).like(like))
    if category:
        query = query.filter(Area.category == category)
    if landmark_only:
        query = query.filter(Area.is_landmark.is_(True))

    return [_to_summary(a) for a in query.limit(limit).all()]


def get_area(session: Session, area_id: int) -> AreaDetail | None:
    """Look up one area by id."""
    row = session.query(Area).filter_by(id=area_id).one_or_none()
    if row is None:
        return None
    return _to_detail(row)