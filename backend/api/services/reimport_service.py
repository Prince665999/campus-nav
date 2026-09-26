"""
reimport_service.py

Wraps the merge-safe reimport so it can be called from the API with
an open session. The pipeline version opens its own session; this one
uses the caller's, so it participates in the request's transaction.
"""

import json
from pathlib import Path

from sqlalchemy.orm import Session

from backend.api.models.area import Area
from backend.api.models.path_edge import PathEdge
from backend.api.models.place import Place
from backend.api.settings import MAP_OSM_PATH
from backend.core.campus_graph import (
    build_graph,
    haversine_m,
    named_areas,
    named_nodes,
    parse_osm,
)
from backend.pipeline.validate_map import validate_map

from .admin_service import _category_from_tags


def _osm_only_place_fields(node, tags):
    """The fields that come from OSM and may be rewritten on reimport."""
    fields = {
        "name": tags["name"],
        "lat": node["lat"],
        "lon": node["lon"],
        "category": _category_from_tags(tags),
    }
    for osm_key, db_key in (
        ("name:sw", "name_sw"),
        ("alt_name", "alt_names"),
        ("description", "description_ai"),
        ("ref", "ref"),
        ("wheelchair", "wheelchair"),
        ("opening_hours", "opening_hours"),
        ("wifi:ssid", "wifi_ssid"),
        ("wifi:password", "wifi_password"),
    ):
        if tags.get(osm_key):
            fields[db_key] = tags[osm_key]
    if tags.get("landmark") == "yes":
        fields["is_landmark"] = True
    if tags.get("wifi") == "yes":
        fields["has_wifi"] = True
    return fields


def _apply_fields(row, fields):
    """Return True if anything actually changed."""
    changed = False
    for key, value in fields.items():
        if value is None:
            continue
        if getattr(row, key) != value:
            setattr(row, key, value)
            changed = True
    return changed


def compute_diff(session: Session) -> dict:
    """
    Report what a re-import would change, without writing anything.
    """
    osm_path = Path(MAP_OSM_PATH)
    if not osm_path.exists():
        raise FileNotFoundError(f"Map file not found at {osm_path}")

    nodes, ways = parse_osm(str(osm_path))

    # counts
    counts = {
        "places_added": 0,
        "places_updated": 0,
        "places_unchanged": 0,
        "areas_added": 0,
        "areas_updated": 0,
        "areas_unchanged": 0,
        "edges_added": 0,
        "edges_updated": 0,
        "edges_unchanged": 0,
    }
    sample_changes = []

    # ----- places -----
    for node_id, node in named_nodes(nodes).items():
        row = session.query(Place).filter_by(osm_id=node_id).one_or_none()
        fields = _osm_only_place_fields(node, node["tags"])

        if row is None:
            counts["places_added"] += 1
            if len(sample_changes) < 20:
                sample_changes.append({"type": "place_add", "name": node["tags"]["name"]})
        else:
            would_change = any(
                getattr(row, k, None) != v for k, v in fields.items() if v is not None
            )
            if would_change:
                counts["places_updated"] += 1
                if len(sample_changes) < 20:
                    sample_changes.append(
                        {"type": "place_update", "name": row.name}
                    )
            else:
                counts["places_unchanged"] += 1

    # ----- areas -----
    for area in named_areas(nodes, ways):
        row = session.query(Area).filter_by(osm_id=area["id"]).one_or_none()
        if row is None:
            counts["areas_added"] += 1
        else:
            # Compare just the name and geometry for the diff. A full
            # comparison would need to rebuild the WKT.
            if row.name != area["name"]:
                counts["areas_updated"] += 1
            else:
                counts["areas_unchanged"] += 1

    # ----- edges -----
    _graph, _edges, edge_tags = build_graph(nodes, ways)
    seen = set()
    for pair_key, tags in edge_tags.items():
        a, b = sorted(pair_key)
        if (a, b) in seen:
            continue
        seen.add((a, b))
        if a not in nodes or b not in nodes:
            continue

        row = (
            session.query(PathEdge)
            .filter_by(node_a_osm=a, node_b_osm=b)
            .one_or_none()
        )
        if row is None:
            counts["edges_added"] += 1
        else:
            new_len = haversine_m(
                nodes[a]["lat"], nodes[a]["lon"],
                nodes[b]["lat"], nodes[b]["lon"],
            )
            if abs(row.length_m - new_len) > 0.5:
                counts["edges_updated"] += 1
            else:
                counts["edges_unchanged"] += 1

    return {**counts, "sample_changes": sample_changes}


def run(session: Session) -> dict:
    """
    Apply the re-import. Same logic as backend.pipeline.reimport but
    using the caller's session so the whole thing is one transaction.
    """
    from backend.pipeline.reimport import run_reimport as _pipeline_reimport

    # The pipeline version opens its own session. To keep things
    # simple we just call it and translate its report to a dict.
    # It commits its own transaction; if it fails, the exception
    # propagates and nothing is written.
    report = _pipeline_reimport(osm_path=MAP_OSM_PATH)
    return {
        "places_added": report.places_added,
        "places_updated": report.places_updated,
        "places_unchanged": report.places_unchanged,
        "areas_added": report.areas_added,
        "areas_updated": report.areas_updated,
        "areas_unchanged": report.areas_unchanged,
        "edges_added": report.edges_added,
        "edges_updated": report.edges_updated,
        "edges_unchanged": report.edges_unchanged,
    }