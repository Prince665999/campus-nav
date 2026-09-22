"""
map_health_service.py

Read-only checks that report on the quality of the ingested map.

Every check returns a count and a list of specific items. Nothing
raises. Nothing blocks. This is a diagnostic tool — the admin runs
it to see what needs attention, then decides what to do about it.

Used by:
  - admin/scripts/map_health_check.py (Phase 11)
  - backend/api/routers/admin/map_health.py (Phase 14)

If you add a check, add it to `run_all_checks()` at the bottom. The
CLI and the future web dashboard both iterate over whatever that
returns, so a new check appears in both places automatically.
"""

from dataclasses import dataclass, field

from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.api.models.area import Area
from backend.api.models.path_edge import PathEdge
from backend.api.models.place import Place
from backend.core.campus_graph import build_graph, parse_osm
from backend.api.settings import MAP_OSM_PATH


@dataclass
class HealthCheck:
    """One check and its result."""

    key: str
    label: str
    description: str
    count: int
    items: list = field(default_factory=list)
    ok: bool = True  # informational only — never blocks anything


@dataclass
class HealthReport:
    """The full set of checks and their results."""

    checks: list[HealthCheck] = field(default_factory=list)

    def total_issues(self) -> int:
        return sum(c.count for c in self.checks)

    def summary_lines(self) -> list[str]:
        lines = []
        for c in self.checks:
            status = "OK" if c.count == 0 else f"{c.count} to review"
            lines.append(f"  {c.label}: {status}")
        return lines


# ---------------------------------------------------------------------------
# Individual checks
# ---------------------------------------------------------------------------

def check_missing_swahili_names(session: Session, limit: int = 20) -> HealthCheck:
    """
    Places with no `name_sw`. Informational — a place can be perfectly
    usable without a Kiswahili name.
    """
    count = (
        session.query(func.count(Place.id))
        .filter((Place.name_sw.is_(None)) | (Place.name_sw == ""))
        .scalar()
    ) or 0

    items = [
        {"id": p.id, "name": p.name}
        for p in (
            session.query(Place)
            .filter((Place.name_sw.is_(None)) | (Place.name_sw == ""))
            .order_by(Place.name)
            .limit(limit)
            .all()
        )
    ]

    return HealthCheck(
        key="missing_name_sw",
        label="Places without a Kiswahili name",
        description=(
            "Not an error. Useful to know for Phase 9's bilingual search. "
            "Add a `name:sw` tag to the OSM node to fix."
        ),
        count=count,
        items=items,
    )


def check_missing_category(session: Session, limit: int = 20) -> HealthCheck:
    """
    Places with no category. The Home screen's category chips filter
    on this, so an uncategorised place can't be found that way.
    """
    count = (
        session.query(func.count(Place.id))
        .filter((Place.category.is_(None)) | (Place.category == ""))
        .scalar()
    ) or 0

    items = [
        {"id": p.id, "name": p.name}
        for p in (
            session.query(Place)
            .filter((Place.category.is_(None)) | (Place.category == ""))
            .order_by(Place.name)
            .limit(limit)
            .all()
        )
    ]

    return HealthCheck(
        key="missing_category",
        label="Places without a category",
        description=(
            "Not an error. Places without a category can't be found via "
            "the category chips. Add `amenity`, `office`, or `building` "
            "to the OSM node."
        ),
        count=count,
        items=items,
    )


def check_disconnected_places(session: Session, limit: int = 20) -> HealthCheck:
    """
    Places whose coordinates don't land near any routable footpath.
    A student can't get directions to a place that isn't near a path.

    This is informational. The map has places that are genuinely
    off-network — a gate you can't currently walk to, a building whose
    footpath hasn't been surveyed yet.
    """
    # Parse the graph once, then for each place, find the nearest
    # graph node and record the distance. Places further than
    # DISCONNECTED_RADIUS_M from any node count as disconnected.
    DISCONNECTED_RADIUS_M = 50

    try:
        nodes, ways = parse_osm(str(MAP_OSM_PATH))
        graph, _edges, _tags = build_graph(nodes, ways)
    except Exception:
        # If the map can't even be parsed, report zero and let the
        # validate_map step report the parse error separately.
        return HealthCheck(
            key="disconnected_places",
            label="Places not near a footpath",
            description="Could not check — map failed to parse.",
            count=0,
            items=[],
        )

    if not graph:
        return HealthCheck(
            key="disconnected_places",
            label="Places not near a footpath",
            description="No routable graph found.",
            count=0,
            items=[],
        )

    # Precompute node coordinates for speed.
    node_coords = [
        (nid, nodes[nid]["lat"], nodes[nid]["lon"]) for nid in graph
    ]

    def distance_to_nearest_node(lat, lon):
        from backend.core.campus_graph import haversine_m

        best = float("inf")
        for _nid, nlat, nlon in node_coords:
            d = haversine_m(lat, lon, nlat, nlon)
            if d < best:
                best = d
        return best

    disconnected = []
    total_disconnected = 0
    for place in session.query(Place).all():
        d = distance_to_nearest_node(place.lat, place.lon)
        if d > DISCONNECTED_RADIUS_M:
            total_disconnected += 1
            if len(disconnected) < limit:
                disconnected.append(
                    {
                        "id": place.id,
                        "name": place.name,
                        "distance_to_path_m": round(d),
                    }
                )

    return HealthCheck(
        key="disconnected_places",
        label="Places not near a footpath",
        description=(
            f"Places more than {DISCONNECTED_RADIUS_M}m from any footpath. "
            "Not an error — it means the footpath to that place hasn't "
            "been surveyed yet, or the place is genuinely off-network."
        ),
        count=total_disconnected,
        items=disconnected,
    )


def check_missing_surface(session: Session, limit: int = 20) -> HealthCheck:
    """
    Path edges with no surface tag. Informational — narration mentions
    surface changes, so tagged surfaces produce richer narration.
    """
    count = (
        session.query(func.count(PathEdge.id))
        .filter((PathEdge.surface.is_(None)) | (PathEdge.surface == ""))
        .scalar()
    ) or 0

    items = [
        {
            "node_a": e.node_a_osm,
            "node_b": e.node_b_osm,
        }
        for e in (
            session.query(PathEdge)
            .filter((PathEdge.surface.is_(None)) | (PathEdge.surface == ""))
            .limit(limit)
            .all()
        )
    ]

    return HealthCheck(
        key="missing_surface",
        label="Paths without a surface tag",
        description=(
            "Not an error. Narrating surface changes makes directions "
            "more useful in the rain."
        ),
        count=count,
        items=items,
    )


def check_short_way_polygons(session: Session, limit: int = 20) -> HealthCheck:
    """
    Named areas with fewer than 4 boundary points. A real polygon
    needs at least 3, and closed rings need 4. This catches stray
    ways that got a `name` tag by accident.
    """
    from backend.api.services.area_service import _parse_wkt_polygon

    short = []
    total_short = 0
    for area in session.query(Area).all():
        points = _parse_wkt_polygon(area.geometry_wkt)
        if len(points) < 3:
            total_short += 1
            if len(short) < limit:
                short.append({"id": area.id, "name": area.name, "points": len(points)})

    return HealthCheck(
        key="short_way_polygons",
        label="Areas with fewer than 3 boundary points",
        description=(
            "An area needs at least 3 points to be a shape. This is "
            "worth checking — a short way might not be renderable."
        ),
        count=total_short,
        items=short,
    )


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

def run_all_checks(session: Session) -> HealthReport:
    """
    Run every check. Never raises. Never blocks.

    The order here is the order the CLI and the future dashboard
    display them in. Add new checks to the list and they appear in
    both places.
    """
    report = HealthReport()
    report.checks.append(check_disconnected_places(session))
    report.checks.append(check_missing_swahili_names(session))
    report.checks.append(check_missing_category(session))
    report.checks.append(check_missing_surface(session))
    report.checks.append(check_short_way_polygons(session))
    return report