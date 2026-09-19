"""
Tests for generate_turn_by_turn's ordering and turn detection.

The key property being tested: a straight path should produce zero
turns, a single corner should produce exactly one, and every step's
at_m value should be monotonically non-decreasing.
"""

import pytest

from campus_graph import (
    parse_osm,
    build_graph,
    find_named_node,
    a_star,
    generate_turn_by_turn,
)

from fixtures.synthetic_maps import (
    STRAIGHT_PATH_NORTH,
    SINGLE_RIGHT_TURN,
    write_temp_map,
)


def _route_and_steps(osm_content, tmp_path, start_name, end_name):
    """Parse a synthetic map, route between two named nodes, return
    (path, nodes, steps)."""
    path = write_temp_map(osm_content, tmp_path)
    nodes, ways = parse_osm(path)
    graph, _, _ = build_graph(nodes, ways)
    start_id = find_named_node(nodes, start_name)
    end_id = find_named_node(nodes, end_name)
    route, _distance = a_star(graph, nodes, start_id, end_id)
    return route, nodes, generate_turn_by_turn(route, nodes)


class TestStraightPath:
    def test_no_turns_reported(self, tmp_path):
        _path, _nodes, steps = _route_and_steps(
            STRAIGHT_PATH_NORTH, tmp_path, "Start Point", "End Point"
        )
        turn_steps = [s for s in steps if s["kind"] == "turn"]
        curve_steps = [s for s in steps if s["kind"] == "curve"]
        assert len(turn_steps) == 0
        assert len(curve_steps) == 0

    def test_starts_and_arrives(self, tmp_path):
        _path, _nodes, steps = _route_and_steps(
            STRAIGHT_PATH_NORTH, tmp_path, "Start Point", "End Point"
        )
        assert steps[0]["kind"] == "start"
        assert steps[-1]["kind"] == "arrive"

    def test_at_m_monotonic(self, tmp_path):
        _path, _nodes, steps = _route_and_steps(
            STRAIGHT_PATH_NORTH, tmp_path, "Start Point", "End Point"
        )
        at_ms = [s["at_m"] for s in steps]
        for i in range(1, len(at_ms)):
            assert at_ms[i] >= at_ms[i - 1]


class TestSingleCorner:
    def test_exactly_one_turn_reported(self, tmp_path):
        _path, _nodes, steps = _route_and_steps(
            SINGLE_RIGHT_TURN, tmp_path, "Corner Start", "Corner End"
        )
        turn_steps = [s for s in steps if s["kind"] == "turn"]
        assert len(turn_steps) == 1

    def test_turn_is_to_the_right(self, tmp_path):
        _path, _nodes, steps = _route_and_steps(
            SINGLE_RIGHT_TURN, tmp_path, "Corner Start", "Corner End"
        )
        turn_steps = [s for s in steps if s["kind"] == "turn"]
        # The word "right" should appear in the instruction.
        assert "right" in turn_steps[0]["instruction"].lower()


class TestOrdering:
    def test_turn_comes_before_arrival(self, tmp_path):
        _path, _nodes, steps = _route_and_steps(
            SINGLE_RIGHT_TURN, tmp_path, "Corner Start", "Corner End"
        )
        turn_index = next(i for i, s in enumerate(steps) if s["kind"] == "turn")
        arrive_index = next(i for i, s in enumerate(steps) if s["kind"] == "arrive")
        assert turn_index < arrive_index