"""
Tests for _edge_level_for_step in route_composer.py.

This is the function that reads the level tag off an edge and works
out which floor the walker is on after crossing it. It's pure logic
given a graph — no DB or network.
"""

from backend.api.services.route_composer import _edge_level_for_step


def _graph_with_edges(*edges):
    """
    Build a minimal graph dict from a list of (a, b, kind, level)
    tuples. Matches the shape that indoor_graph_builder produces.
    """
    g = {}
    for a, b, kind, level in edges:
        info = {"kind": kind, "way_tags": {"level": level} if level else {}}
        g.setdefault(a, []).append((b, 0.0, info))
        g.setdefault(b, []).append((a, 0.0, info))
    return g


class TestCorridorEdge:
    def test_returns_single_level(self):
        g = _graph_with_edges(("1", "2", "walk", "0"))
        assert _edge_level_for_step("1", "2", None, g) == "0"

    def test_negative_level(self):
        g = _graph_with_edges(("1", "2", "walk", "-1"))
        assert _edge_level_for_step("1", "2", "0", g) == "-1"


class TestStairsGoingUp:
    def test_from_bottom_to_top(self):
        g = _graph_with_edges(("1", "2", "stairs", "0;1"))
        assert _edge_level_for_step("1", "2", "0", g) == "1"

    def test_three_floors_from_ground(self):
        g = _graph_with_edges(("1", "2", "stairs", "-1;0;1"))
        assert _edge_level_for_step("1", "2", "0", g) == "1"


class TestStairsGoingDown:
    def test_from_top_to_bottom(self):
        g = _graph_with_edges(("1", "2", "stairs", "0;-1"))
        assert _edge_level_for_step("1", "2", "0", g) == "-1"

    def test_from_ground_down_in_three(self):
        g = _graph_with_edges(("1", "2", "stairs", "-1;0;1"))
        assert _edge_level_for_step("1", "2", "1", g) == "0"


class TestNoLevel:
    def test_returns_none_when_no_tag(self):
        g = _graph_with_edges(("1", "2", "walk", None))
        assert _edge_level_for_step("1", "2", "0", g) is None

    def test_returns_none_when_no_edge(self):
        g = _graph_with_edges(("1", "2", "walk", "0"))
        # There's no edge 3->4.
        assert _edge_level_for_step("3", "4", "0", g) is None


class TestUnknownCurrentLevel:
    def test_unknown_current_level_on_stairs_picks_top(self):
        # Walker's current level (5) isn't in the stairs list; fall
        # back to the last entry.
        g = _graph_with_edges(("1", "2", "stairs", "0;1"))
        assert _edge_level_for_step("1", "2", "5", g) == "1"

    def test_no_current_level_picks_top(self):
        g = _graph_with_edges(("1", "2", "stairs", "0;1"))
        assert _edge_level_for_step("1", "2", None, g) == "1"