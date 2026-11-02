"""
Tests for a live GPS start on a MIXED (outdoor -> indoor) route.

Bug being guarded against: the route used to start at the nearest
outdoor NODE. A student standing mid-path was placed on a junction up
to half a path length away, sometimes behind them. The start is now the
nearest point on the footpath itself.

These tests use a tiny synthetic map injected in place of the real
indoor graph bundle, so they need no database and no OSM files.
"""

import pytest

from backend.api.services import indoor_graph_builder, route_composer
from backend.api.services.route_composer import (
    VIRTUAL_OUTDOOR_START_ID,
    _route_via_indoor_engine,
    _snap_live_fix_to_outdoor_edge,
    _start_node_for_snap,
)
from backend.core.campus_graph import haversine_m

M = 111_195.0  # metres per degree of latitude


def _walk(level="0", **extra):
    return {"kind": "walk", "level": level, "way_tags": {"highway": "footway"}, **extra}


def _bundle():
    lat0, lon0 = -8.9430, 33.4180
    nodes = {
        # outdoor: o1 --(111 m north)--> o2 --(~110 m east)--> o3
        "o1": {"lat": lat0, "lon": lon0, "tags": {}},
        "o2": {"lat": lat0 + 111 / M, "lon": lon0, "tags": {}},
        "o3": {"lat": lat0 + 111 / M, "lon": lon0 + 0.001, "tags": {}},
        # building: entrance, then corridor to the destination
        "500": {"lat": lat0 + 111 / M, "lon": lon0 + 0.0011,
                "tags": {"entrance": "yes", "name": "Main Entrance", "level": "0"}},
        "501": {"lat": lat0 + 111 / M, "lon": lon0 + 0.0013,
                "tags": {"level": "0"}},
        "502": {"lat": lat0 + 111 / M, "lon": lon0 + 0.0015,
                "tags": {"level": "0", "name": "Room 1"}},
    }

    graph = {}

    def edge(a, b, info):
        d = haversine_m(nodes[a]["lat"], nodes[a]["lon"], nodes[b]["lat"], nodes[b]["lon"])
        graph.setdefault(a, []).append((b, d, info))
        graph.setdefault(b, []).append((a, d, info))

    outdoor = _walk(outdoor=True)
    edge("o1", "o2", outdoor)
    edge("o2", "o3", outdoor)
    edge("o3", "500", _walk(connector=True))      # connector: must NOT be snapped to
    edge("500", "501", _walk())
    edge("501", "502", _walk())

    return {
        "nodes": nodes,
        "graph": graph,
        "edge_tags": {},
        "door_node_ids": set(),
        "entrance_node_ids": {"500"},
        "corridor_of_door": {},
        "rooms": [],
        "stair_ways": [],
        "entrance_to_outdoor": {},
        "outdoor_node_ids": {"o1", "o2", "o3"},
        "indoor_node_ids": {"500", "501", "502"},
    }


@pytest.fixture
def bundle(monkeypatch):
    b = _bundle()
    monkeypatch.setattr(indoor_graph_builder, "get_indoor_graph", lambda: b)
    return b


def _mid_path_fix(bundle):
    n = bundle["nodes"]
    # 40 m up the first path, 2 m to the side.
    return n["o1"]["lat"] + 40 / M, n["o1"]["lon"] + 2 / 110_000


def _route_from_fix(bundle, lat, lon, accuracy=10.0):
    snap = _snap_live_fix_to_outdoor_edge(lat, lon, bundle, accuracy_m=accuracy)
    assert snap is not None
    start_id, virtual = _start_node_for_snap(snap)
    from_ep = {
        "engine": "indoor", "place_id": None, "kind": "outdoor",
        "node_id": start_id,
        "osm_id": start_id[1:] if start_id.startswith("o") else start_id,
        "name": "your current location", "snap": virtual,
    }
    to_ep = {
        "engine": "indoor", "place_id": 1, "kind": "indoor",
        "node_id": "502", "osm_id": "502", "name": "Room 1",
    }
    return _route_via_indoor_engine(from_ep, to_ep), snap


def test_snap_ignores_connector_and_indoor_edges(bundle):
    n = bundle["nodes"]
    # Standing right at the entrance: the nearest outdoor FOOTPATH is
    # still o2-o3, never the connector or the corridor.
    snap = _snap_live_fix_to_outdoor_edge(
        n["500"]["lat"], n["500"]["lon"], bundle, accuracy_m=10
    )
    assert {snap["a"], snap["b"]} == {"o2", "o3"}


def test_route_starts_at_the_exact_point_on_the_path(bundle):
    lat, lon = _mid_path_fix(bundle)
    route, snap = _route_from_fix(bundle, lat, lon)

    first = route["geometry"][0]
    assert haversine_m(first["lat"], first["lon"], snap["lat"], snap["lon"]) < 0.01
    # Not on any node.
    for nid in ("o1", "o2", "o3"):
        n = bundle["nodes"][nid]
        assert haversine_m(first["lat"], first["lon"], n["lat"], n["lon"]) > 20


def test_route_heads_forward_not_back_to_the_nearest_node(bundle):
    lat, lon = _mid_path_fix(bundle)
    route, _ = _route_from_fix(bundle, lat, lon)
    # 40 m up a 111 m path: only ~71 m remain to o2, then east.
    # Walking back to o1 first would add ~80 m.
    first_leg = route["geometry"][1]
    o2 = bundle["nodes"]["o2"]
    assert (first_leg["lat"], first_leg["lon"]) == (o2["lat"], o2["lon"])


def test_virtual_node_never_leaks_out(bundle):
    lat, lon = _mid_path_fix(bundle)
    route, _ = _route_from_fix(bundle, lat, lon)
    assert VIRTUAL_OUTDOOR_START_ID not in route["node_path"]
    assert route["node_path"][0] == "o2"
    for nid in route["node_path"]:
        assert nid in bundle["nodes"]


def test_shared_bundle_is_not_modified(bundle):
    before_graph = {k: list(v) for k, v in bundle["graph"].items()}
    before_nodes = set(bundle["nodes"])
    lat, lon = _mid_path_fix(bundle)
    _route_from_fix(bundle, lat, lon)
    assert {k: list(v) for k, v in bundle["graph"].items()} == before_graph
    assert set(bundle["nodes"]) == before_nodes


def test_steps_start_outdoor_and_at_m_increases(bundle):
    lat, lon = _mid_path_fix(bundle)
    route, _ = _route_from_fix(bundle, lat, lon)
    steps = route["steps"]
    assert steps[0]["at_m"] == 0.0
    assert steps[0]["mode"] == "outdoor"
    at = [s["at_m"] for s in steps]
    assert at == sorted(at)
    assert route["legs"][0]["mode"] == "outdoor"


def test_fix_too_far_from_every_path_is_refused(bundle):
    n = bundle["nodes"]["o1"]
    assert _snap_live_fix_to_outdoor_edge(
        n["lat"] - 500 / M, n["lon"], bundle, accuracy_m=10
    ) is None


def test_snap_next_to_a_node_uses_that_node(bundle):
    n = bundle["nodes"]["o2"]
    snap = _snap_live_fix_to_outdoor_edge(n["lat"], n["lon"], bundle, accuracy_m=5)
    start_id, virtual = _start_node_for_snap(snap)
    assert start_id == "o2"
    assert virtual is None