"""
ingest.py

Reads map.osm once and writes:
  - one row per named OSM node  → places
  - one row per named OSM way   → areas
  - one row per routable edge   → path_edges

Run:
    python -m backend.pipeline.ingest
    python -m backend.pipeline.ingest path/to/other.osm

The first run creates the schema and populates it. Subsequent runs
either upsert (safe, preserves manual edits) or replace everything
(destructive, controlled by INGEST_REPLACE).

Uses campus_graph.py for parsing and graph building rather than
re-implementing it. Never edits the frozen file.
"""

import sys
from pathlib import Path

from sqlalchemy import delete

from backend.api.db.init_db import init_db
from backend.api.db.session import session_scope
from backend.api.models.area import Area
from backend.api.models.path_edge import PathEdge
from backend.api.models.place import Place
from backend.api.settings import MAP_OSM_PATH, INGEST_REPLACE
from backend.core.campus_graph import (
    parse_osm,
    build_graph,
    named_nodes,
    named_areas,
    haversine_m,
)
from backend.pipeline.validate_map import validate_map


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------

# Which OSM tag becomes the row's `category`. Ordered: the first tag
# present wins. This is what the mobile app's category chips filter on.
_CATEGORY_TAGS = (
    "amenity",
    "office",
    "building",
    "shop",
    "tourism",
    "leisure",
    "healthcare",
)


def _category_from_tags(tags):
    """First recognised category tag, or None."""
    for key in _CATEGORY_TAGS:
        if key in tags:
            return f"{key}={tags[key]}"
    return None


# ---------------------------------------------------------------------------
# Ingestion
# ---------------------------------------------------------------------------

def ingest_places(nodes, session):
    """Write one row per named node. Returns count written."""
    named = named_nodes(nodes)
    written = 0
    for node_id, node in named.items():
        tags = node["tags"]
        existing = session.query(Place).filter_by(osm_id=node_id).one_or_none()

        if existing is None:
            existing = Place(osm_type="node", osm_id=node_id)
            session.add(existing)

        # OSM-sourced fields. These are safe to overwrite on re-import.
        existing.name = tags["name"]
        existing.lat = node["lat"]
        existing.lon = node["lon"]

        # Fields that come from OSM but may also be hand-edited. Only
        # overwrite when the OSM tag is present, so a manual edit in
        # the admin app isn't clobbered on the next re-import.
        if tags.get("name:sw"):
            existing.name_sw = tags["name:sw"]
        if tags.get("alt_name"):
            existing.alt_names = tags["alt_name"]
        if tags.get("description"):
            existing.description = tags["description"]

        # Everything below is set-once from OSM. Hand edits to these
        # are rare; if you need them, use edit_place.py which will set
        # them and reimport won't touch them because the tag is absent.
        existing.category = _category_from_tags(tags) or existing.category
        existing.ref = tags.get("ref", existing.ref)
        existing.wheelchair = tags.get("wheelchair", existing.wheelchair)
        existing.opening_hours = tags.get("opening_hours", existing.opening_hours)
        existing.is_landmark = tags.get("landmark") == "yes" or existing.is_landmark
        existing.has_wifi = tags.get("wifi") == "yes" or existing.has_wifi
        existing.wifi_ssid = tags.get("wifi:ssid", existing.wifi_ssid)
        existing.wifi_password = tags.get("wifi:password", existing.wifi_password)

        written += 1
    return written


def ingest_areas(nodes, ways, session):
    """Write one row per named way. Returns count written."""
    areas = named_areas(nodes, ways)
    written = 0

    for area in areas:
        tags = area["tags"]
        existing = session.query(Area).filter_by(osm_id=area["id"]).one_or_none()

        if existing is None:
            existing = Area(osm_type="way", osm_id=area["id"])
            session.add(existing)

        # WKT polygon: "POLYGON((lon lat, lon lat, ...))" — note lon
        # first, which is the WKT convention.
        coords = ", ".join(f"{lon} {lat}" for lat, lon in area["vertices"])
        # Close the ring if not already closed.
        first_lat, first_lon = area["vertices"][0]
        last_lat, last_lon = area["vertices"][-1]
        if (first_lat, first_lon) != (last_lat, last_lon):
            coords += f", {first_lon} {first_lat}"
        existing.geometry_wkt = f"POLYGON(({coords}))"

        existing.name = area["name"]
        if tags.get("name:sw"):
            existing.name_sw = tags["name:sw"]
        if tags.get("alt_name"):
            existing.alt_names = tags["alt_name"]
        if tags.get("description"):
            existing.description = tags["description"]
        existing.category = _category_from_tags(tags) or existing.category

        # landmark=yes means "worth mentioning in narration". Default is
        # True for now (Phase 3 has no tagging guide enforcement yet);
        # set it to False only when explicitly tagged landmark=no.
        existing.is_landmark = tags.get("landmark") != "no"

        written += 1
    return written


def ingest_path_edges(nodes, ways, session):
    """Write one row per edge in the routing graph. Returns count written."""
    _graph, _footpath_edges, edge_tags = build_graph(nodes, ways)
    written = 0
    seen_pairs = set()

    for pair_key, tags in edge_tags.items():
        # pair_key is a frozenset({a, b}). We need a canonical order so
        # the unique index (node_a, node_b) doesn't create duplicates
        # when the same edge is seen from both directions.
        a, b = sorted(pair_key)
        if (a, b) in seen_pairs:
            continue
        seen_pairs.add((a, b))

        if a not in nodes or b not in nodes:
            continue

        length = haversine_m(
            nodes[a]["lat"], nodes[a]["lon"],
            nodes[b]["lat"], nodes[b]["lon"],
        )

        existing = (
            session.query(PathEdge)
            .filter_by(node_a_osm=a, node_b_osm=b)
            .one_or_none()
        )
        if existing is None:
            existing = PathEdge(node_a_osm=a, node_b_osm=b)
            session.add(existing)

        existing.length_m = length
        existing.highway = tags.get("highway", existing.highway)
        existing.surface = tags.get("surface", existing.surface)
        existing.lit = tags.get("lit", existing.lit)
        existing.covered = tags.get("covered", existing.covered)
        existing.incline = tags.get("incline", existing.incline)
        existing.wheelchair = tags.get("wheelchair", existing.wheelchair)
        existing.access = tags.get("access", existing.access)
        existing.description = tags.get("description", existing.description)

        written += 1
    return written


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def run_ingest(osm_path=None, replace=None):
    """Run the full pipeline. Returns a dict of counts."""
    osm_path = Path(osm_path or MAP_OSM_PATH)
    if replace is None:
        replace = INGEST_REPLACE

    if not osm_path.exists():
        raise FileNotFoundError(f"map.osm not found at {osm_path}")

    print(f"Validating {osm_path} ...")
    issues = validate_map(osm_path)
    print(issues.summary())
    print()

    print(f"Parsing {osm_path} ...")
    nodes, ways = parse_osm(str(osm_path))
    print(f"  {len(nodes)} nodes, {len(ways)} ways")

    print("Ensuring schema exists ...")
    init_db()

    with session_scope() as session:
        if replace:
            print("Clearing existing rows (INGEST_REPLACE=true) ...")
            session.execute(delete(PathEdge))
            session.execute(delete(Area))
            session.execute(delete(Place))

        n_places = ingest_places(nodes, session)
        print(f"  places: {n_places}")

        n_areas = ingest_areas(nodes, ways, session)
        print(f"  areas: {n_areas}")

        n_edges = ingest_path_edges(nodes, ways, session)
        print(f"  path edges: {n_edges}")

    print("\nIngest complete.")
    return {"places": n_places, "areas": n_areas, "edges": n_edges}


if __name__ == "__main__":
    path_arg = sys.argv[1] if len(sys.argv) > 1 else None
    run_ingest(osm_path=path_arg)