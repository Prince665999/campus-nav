"""
validate_map.py

Sanity-checks map.osm before it's ingested. Catches the mistakes that
would otherwise turn into silent narration bugs: dangling node refs,
duplicate OSM ids, ways with too few nodes, and paths with no
highway tag.

Called by ingest.py; also reused by the map health check in Phase 11.
"""

from dataclasses import dataclass, field
from typing import List

from backend.core.campus_graph import parse_osm, named_nodes, named_areas


@dataclass
class MapIssues:
    """Everything validate_map found. Empty lists mean a clean map."""

    dangling_refs: List[str] = field(default_factory=list)
    duplicate_ids: List[str] = field(default_factory=list)
    short_ways: List[str] = field(default_factory=list)
    untagged_ways: List[str] = field(default_factory=list)
    named_but_unroutable: List[str] = field(default_factory=list)

    @property
    def is_clean(self) -> bool:
        return not (
            self.dangling_refs
            or self.duplicate_ids
            or self.short_ways
            or self.untagged_ways
        )

    def summary(self) -> str:
        if self.is_clean:
            return "Map validation passed with no issues."
        lines = ["Map validation found issues:"]
        if self.dangling_refs:
            lines.append(f"  - {len(self.dangling_refs)} way refs point at missing nodes")
        if self.duplicate_ids:
            lines.append(f"  - {len(self.duplicate_ids)} duplicate OSM ids")
        if self.short_ways:
            lines.append(f"  - {len(self.short_ways)} ways with fewer than 2 nodes")
        if self.untagged_ways:
            lines.append(f"  - {len(self.untagged_ways)} ways with no tags")
        if self.named_but_unroutable:
            lines.append(
                f"  - {len(self.named_but_unroutable)} named places not on any path"
            )
        return "\n".join(lines)


def validate_map(osm_path):
    """
    Run every check. Returns a MapIssues. Does not raise on issues —
    the caller decides whether to block ingestion or just warn.
    """
    issues = MapIssues()

    nodes, ways = parse_osm(str(osm_path))

    # Duplicate node ids
    seen_node_ids = set()
    for node_id in nodes:
        if node_id in seen_node_ids:
            issues.duplicate_ids.append(node_id)
        seen_node_ids.add(node_id)

    # Way-level checks
    for way in ways:
        refs = way["refs"]
        if len(refs) < 2:
            issues.short_ways.append(way["id"])
        if not way["tags"]:
            issues.untagged_ways.append(way["id"])
        for ref in refs:
            if ref not in nodes:
                issues.dangling_refs.append(f"way {way['id']} -> node {ref}")

    # Named nodes that aren't touched by any way with a highway tag
    routable_node_ids = set()
    for way in ways:
        if way["tags"].get("highway"):
            routable_node_ids.update(way["refs"])

    for node_id, node in named_nodes(nodes).items():
        if node_id not in routable_node_ids:
            issues.named_but_unroutable.append(
                node["tags"].get("name", node_id)
            )

    return issues


def _main():
    import sys
    from backend.api.settings import MAP_OSM_PATH

    path = sys.argv[1] if len(sys.argv) > 1 else MAP_OSM_PATH
    print(f"Validating {path} ...")
    issues = validate_map(path)
    print(issues.summary())

    named = named_nodes(parse_osm(str(path))[0])
    print(f"\nMap summary:")
    print(f"  named points: {len(named)}")
    print(f"  named areas:  {len(named_areas(*parse_osm(str(path))))}")


if __name__ == "__main__":
    _main()