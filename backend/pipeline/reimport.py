"""
reimport.py

Merge-safe re-import. When map.osm is updated, run this instead of
ingest.py — it does the same thing but *only writes columns that came
from OSM tags*, so anything added to the database by hand (photos,
edited descriptions, aliases added by an admin, Wi-Fi passwords set
in the admin app rather than in map.osm) survives untouched.

Matches on osm_id. Reports how many rows were added, updated, and
left alone so you can see what actually changed.
"""

from dataclasses import dataclass
from pathlib import Path

from backend.api.db.init_db import init_db
from backend.api.db.session import session_scope
from backend.api.models.area import Area
from backend.api.models.path_edge import PathEdge
from backend.api.models.place import Place
from backend.core.campus_graph import (
    parse_osm,
    build_graph,
    named_nodes,
    named_areas,
    haversine_m,
)
from backend.api.settings import MAP_OSM_PATH
from backend.pipeline.ingest import _category_from_tags
from backend.pipeline.validate_map import validate_map


@dataclass
class ReimportReport:
    places_added: int = 0
    places_updated: int = 0
    places_unchanged: int = 0
    areas_added: int = 0
    areas_updated: int = 0
    areas_unchanged: int = 0
    edges_added: int = 0
    edges_updated: int = 0
    edges_unchanged: int = 0

    def summary(self):
        lines = ["Re-import report:"]
        lines.append(
            f"  places: +{self.places_added} ~{self.places_updated} ={self.places_unchanged}"
        )
        lines.append(
            f"  areas:  +{self.areas_added} ~{self.areas_updated} ={self.areas_unchanged}"
        )
        lines.append(
            f"  edges:  +{self.edges_added} ~{self.edges_updated} ={self.edges_unchanged}"
        )
        return "\n".join(lines)


def _osm_only_place_fields(node, tags):
    """Return the dict of fields that come from OSM and may be written
    on re-import. Every other column is preserved as-is."""
    fields = {
        "name": tags["name"],
        "lat": node["lat"],
        "lon": node["lon"],
        "category": _category_from_tags(tags),
    }
    # These are only written when the tag is present in OSM. If the tag
    # is absent, we leave the DB value alone — it may have been set by
    # hand and we must not clobber it.
    for osm_key, db_key in (
        ("name:sw", "name_sw"),
        ("alt_name", "alt_names"),
        ("description", "description"),
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
    """Return True if anything changed."""
    changed = False
    for key, value in fields.items():
        if value is None:
            continue
        if getattr(row, key) != value:
            setattr(row, key, value)
            changed = True
    return changed


def run_reimport(osm_path=None):
    """Merge map.osm into the existing database. Never deletes rows."""
    osm_path = Path(osm_path or MAP_OSM_PATH)
    if not osm_path.exists():
        raise FileNotFoundError(f"map.osm not found at {osm_path}")

    print(f"Validating {osm_path} ...")
    print(validate_map(osm_path).summary())
    print()

    nodes, ways = parse_osm(str(osm_path))
    print(f"Parsed {len(nodes)} nodes, {len(ways)} ways")

    init_db()
    report = ReimportReport()

    with session_scope() as session:
        # ---------- places ----------
        for node_id, node in named_nodes(nodes).items():
            row = session.query(Place).filter_by(osm_id=node_id).one_or_none()
            fields = _osm_only_place_fields(node, node["tags"])
            if row is None:
                row = Place(osm_type="node", osm_id=node_id)
                _apply_fields(row, fields)
                session.add(row)
                report.places_added += 1
            elif _apply_fields(row, fields):
                report.places_updated += 1
            else:
                report.places_unchanged += 1

        # ---------- areas ----------
        for area in named_areas(nodes, ways):
            row = session.query(Area).filter_by(osm_id=area["id"]).one_or_none()
            tags = area["tags"]

            coords = ", ".join(f"{lon} {lat}" for lat, lon in area["vertices"])
            first = area["vertices"][0]
            last = area["vertices"][-1]
            if first != last:
                coords += f", {first[1]} {first[0]}"
            wkt = f"POLYGON(({coords}))"

            fields = {
                "name": area["name"],
                "geometry_wkt": wkt,
                "category": _category_from_tags(tags),
            }
            for osm_key, db_key in (
                ("name:sw", "name_sw"),
                ("alt_name", "alt_names"),
                ("description", "description"),
            ):
                if tags.get(osm_key):
                    fields[db_key] = tags[osm_key]
            if tags.get("landmark") == "no":
                fields["is_landmark"] = False

            if row is None:
                row = Area(osm_type="way", osm_id=area["id"])
                _apply_fields(row, fields)
                session.add(row)
                report.areas_added += 1
            elif _apply_fields(row, fields):
                report.areas_updated += 1
            else:
                report.areas_unchanged += 1

        # ---------- edges ----------
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
            fields = {
                "length_m": haversine_m(
                    nodes[a]["lat"], nodes[a]["lon"],
                    nodes[b]["lat"], nodes[b]["lon"],
                ),
                "highway": tags.get("highway"),
                "surface": tags.get("surface"),
                "lit": tags.get("lit"),
                "covered": tags.get("covered"),
                "incline": tags.get("incline"),
                "wheelchair": tags.get("wheelchair"),
                "access": tags.get("access"),
                "description": tags.get("description"),
            }
            if row is None:
                row = PathEdge(node_a_osm=a, node_b_osm=b)
                _apply_fields(row, fields)
                session.add(row)
                report.edges_added += 1
            elif _apply_fields(row, fields):
                report.edges_updated += 1
            else:
                report.edges_unchanged += 1

    print("\n" + report.summary())
    return report


if __name__ == "__main__":
    import sys

    path = sys.argv[1] if len(sys.argv) > 1 else None
    run_reimport(path)