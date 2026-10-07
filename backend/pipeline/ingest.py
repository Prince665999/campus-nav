"""
ingest.py

Reads map.osm once and writes:
  - one row per named OSM node  → places (kind="outdoor")
  - one row per named OSM way   → areas
  - one row per routable edge   → path_edges

Then reads final.osm and writes:
  - one row per door node       → places (kind="indoor")
  - one row per room polygon    → indoor_areas
  - one row per walkable edge   → indoor_path_edges

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
from backend.api.models.indoor_area import IndoorArea
from backend.api.models.indoor_path_edge import IndoorPathEdge
from backend.api.models.path_edge import PathEdge
from backend.api.models.place import Place
from backend.api.settings import (
    INDOOR_OSM_PATH,
    INGEST_REPLACE,
    MAP_OSM_PATH,
)
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
# Outdoor ingestion
# ---------------------------------------------------------------------------

def ingest_places(nodes, session):
    """Write one row per named node. Returns count written."""
    named = named_nodes(nodes)
    written = 0
    for node_id, node in named.items():
        tags = node["tags"]
        existing = session.query(Place).filter_by(osm_id=node_id).one_or_none()

        if existing is None:
            existing = Place(
                osm_type="node", osm_id=node_id, kind="outdoor"
            )
            session.add(existing)

        existing.name = tags["name"]
        existing.lat = node["lat"]
        existing.lon = node["lon"]

        if tags.get("name:sw"):
            existing.name_sw = tags["name:sw"]
        if tags.get("alt_name"):
            existing.alt_names = tags["alt_name"]
        if tags.get("description"):
            existing.description_ai = tags["description"]

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

        coords = ", ".join(f"{lon} {lat}" for lat, lon in area["vertices"])
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
            existing.description_ai = tags["description"]
        existing.category = _category_from_tags(tags) or existing.category

        existing.is_landmark = tags.get("landmark") != "no"

        written += 1
    return written


def ingest_path_edges(nodes, ways, session):
    """Write one row per edge in the outdoor routing graph."""
    _graph, _footpath_edges, edge_tags = build_graph(nodes, ways)
    written = 0
    seen_pairs = set()

    for pair_key, tags in edge_tags.items():
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
        existing.description_ai = tags.get("description", existing.description_ai)

        written += 1
    return written


# ---------------------------------------------------------------------------
# Indoor ingestion
# ---------------------------------------------------------------------------

# Same walkable set the frozen indoor engine uses.
_INDOOR_WALKABLE_HIGHWAY = {"footway", "corridor", "path"}
_INDOOR_STAIRS_HIGHWAY = "steps"


def _is_door(tags):
    return bool(tags.get("door")) or tags.get("indoor") == "door"


def ingest_indoor_places(nodes, ways, session):
    """
    Write one Place row per door node, one IndoorArea row per room
    polygon, and one IndoorPathEdge row per walkable edge.

    Returns a dict of counts: {"places": n, "areas": n, "edges": n}.
    """
    door_node_ids = {nid for nid, d in nodes.items() if _is_door(d["tags"])}

    # ---- Places: one per door node ----
    # Also build a door -> room-name map from the room polygons.
    rooms_of_door: dict[str, list[str]] = {}
    for way in ways:
        tags = way["tags"]
        if tags.get("indoor") != "room":
            continue
        rname = (tags.get("name") or tags.get("ref") or "").strip()
        if not rname:
            continue
        for ref in way["refs"]:
            if ref in door_node_ids:
                rooms_of_door.setdefault(ref, []).append(rname)

    places_written = 0
    for nid in door_node_ids:
        node = nodes[nid]
        tags = node["tags"]

        name = (tags.get("name") or tags.get("ref") or "").strip()
        if not name:
            name = f"door {nid}"

        level = tags.get("level")
        if level is not None:
            level = str(level).split(";")[0]

        room_names = rooms_of_door.get(nid, [])
        room_name = "; ".join(sorted(set(room_names))) if room_names else None

        existing = session.query(Place).filter_by(osm_id=nid).one_or_none()
        if existing is None:
            existing = Place(osm_type="node", osm_id=nid, kind="indoor")
            session.add(existing)

        existing.name = name
        existing.lat = node["lat"]
        existing.lon = node["lon"]
        existing.kind = "indoor"
        existing.level = level
        existing.room_name = room_name
        existing.ref = tags.get("ref") or existing.ref
        existing.description_ai = tags.get("description") or existing.description_ai

        places_written += 1

    # ---- Indoor areas: one per room polygon ----
    areas_written = 0
    for way in ways:
        tags = way["tags"]
        if tags.get("indoor") != "room":
            continue

        rname = (tags.get("name") or tags.get("ref") or "").strip()
        if not rname:
            continue

        refs = [r for r in way["refs"] if r in nodes]
        if len(refs) < 3:
            continue

        # WKT polygon. Closes the ring if needed.
        coords = ", ".join(
            f"{nodes[r]['lon']} {nodes[r]['lat']}" for r in refs
        )
        first_lat = nodes[refs[0]]["lat"]
        first_lon = nodes[refs[0]]["lon"]
        last_lat = nodes[refs[-1]]["lat"]
        last_lon = nodes[refs[-1]]["lon"]
        if (first_lat, first_lon) != (last_lat, last_lon):
            coords += f", {first_lon} {first_lat}"
        wkt = f"POLYGON(({coords}))"

        level = tags.get("level")
        if level is not None:
            level = str(level).split(";")[0]

        # Door node: the first door shared between this polygon and
        # the walkable network, if any.
        shared_doors = [r for r in way["refs"] if r in door_node_ids]
        door_node_id = shared_doors[0] if shared_doors else None

        existing = (
            session.query(IndoorArea)
            .filter_by(osm_id=way["id"])
            .one_or_none()
        )
        if existing is None:
            existing = IndoorArea(osm_type="way", osm_id=way["id"])
            session.add(existing)

        existing.name = rname
        existing.ref = tags.get("ref")
        existing.level = level
        existing.geometry_wkt = wkt
        existing.door_node_id = door_node_id

        areas_written += 1

    # ---- Indoor path edges: one per walkable segment ----
    edges_written = 0
    seen_pairs = set()
    for way in ways:
        tags = way["tags"]
        hw = tags.get("highway", "")
        if hw not in _INDOOR_WALKABLE_HIGHWAY and hw != _INDOOR_STAIRS_HIGHWAY:
            continue

        kind = "stairs" if hw == _INDOOR_STAIRS_HIGHWAY else "walk"
        level = tags.get("level")
        corridor = str(tags.get("corridor", "")).strip().lower() in (
            "yes", "true", "1"
        )

        refs = way["refs"]
        for i in range(len(refs) - 1):
            a, b = refs[i], refs[i + 1]
            if a not in nodes or b not in nodes:
                continue
            pair = tuple(sorted((a, b)))
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)

            length = haversine_m(
                nodes[a]["lat"], nodes[a]["lon"],
                nodes[b]["lat"], nodes[b]["lon"],
            )

            existing = (
                session.query(IndoorPathEdge)
                .filter_by(node_a_osm=pair[0], node_b_osm=pair[1])
                .one_or_none()
            )
            if existing is None:
                existing = IndoorPathEdge(
                    node_a_osm=pair[0], node_b_osm=pair[1]
                )
                session.add(existing)

            existing.length_m = length
            existing.highway = hw
            existing.level = level
            existing.kind = kind
            existing.corridor = corridor
            existing.description = tags.get("description")

            edges_written += 1

    return {
        "places": places_written,
        "areas": areas_written,
        "edges": edges_written,
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def run_ingest(osm_path=None, indoor_osm_path=None, replace=None):
    """Run the full pipeline (outdoor + indoor). Returns a dict of counts."""
    osm_path = Path(osm_path or MAP_OSM_PATH)
    indoor_osm_path = Path(indoor_osm_path or INDOOR_OSM_PATH)
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
            session.execute(delete(IndoorPathEdge))
            session.execute(delete(IndoorArea))
            session.execute(delete(PathEdge))
            session.execute(delete(Area))
            session.execute(delete(Place))

        n_places = ingest_places(nodes, session)
        print(f"  outdoor places: {n_places}")

        n_areas = ingest_areas(nodes, ways, session)
        print(f"  areas: {n_areas}")

        n_edges = ingest_path_edges(nodes, ways, session)
        print(f"  path edges: {n_edges}")

        print(f"\nReading indoor map {indoor_osm_path} ...")
        if not indoor_osm_path.exists():
            print(f"  indoor map not found at {indoor_osm_path} — skipping")
            n_indoor_places = n_indoor_areas = n_indoor_edges = 0
        else:
            indoor_nodes, indoor_ways = parse_osm(str(indoor_osm_path))
            counts = ingest_indoor_places(indoor_nodes, indoor_ways, session)
            n_indoor_places = counts["places"]
            n_indoor_areas = counts["areas"]
            n_indoor_edges = counts["edges"]
            print(f"  indoor door places: {n_indoor_places}")
            print(f"  indoor rooms: {n_indoor_areas}")
            print(f"  indoor path edges: {n_indoor_edges}")

    print("\nIngest complete.")
    return {
        "places": n_places,
        "areas": n_areas,
        "edges": n_edges,
        "indoor_places": n_indoor_places,
        "indoor_areas": n_indoor_areas,
        "indoor_edges": n_indoor_edges,
    }


if __name__ == "__main__":
    path_arg = sys.argv[1] if len(sys.argv) > 1 else None
    run_ingest(osm_path=path_arg)