"""
Tests for area_extents_along_route and its helpers.

These are the tests that lock in the redesign described in
ai_navigator.py's docstring: an area should be anchored at the
distance where it BEGINS alongside the walker, not at the point of
closest approach. Two areas that start together on opposite sides
should report the same begins_m.
"""

import pytest

from campus_graph import parse_osm, build_graph, find_named_node, a_star, named_areas
from ai_navigator import area_extents_along_route, dedupe_areas

from fixtures.synthetic_maps import (
    PATH_WITH_BUILDING_EAST,
    PAIR_OF_BUILDINGS,
    write_temp_map,
)


def _extents(osm_content, tmp_path, start_name, end_name):
    """Parse, route, and return area extents along the route."""
    path = write_temp_map(osm_content, tmp_path)
    nodes, ways = parse_osm(path)
    graph, _, _ = build_graph(nodes, ways)
    areas = named_areas(nodes, ways)
    start_id = find_named_node(nodes, start_name)
    end_id = find_named_node(nodes, end_name)
    route, _distance = a_star(graph, nodes, start_id, end_id)
    extents = area_extents_along_route(route, nodes, areas)
    return dedupe_areas(extents)


class TestBuildingAlongsidePath:
    def test_building_is_detected(self, tmp_path):
        extents = _extents(
            PATH_WITH_BUILDING_EAST, tmp_path, "Path Start", "Path End"
        )
        names = [e["name"] for e in extents]
        assert "Test Building" in names

    def test_building_is_on_the_right(self, tmp_path):
        extents = _extents(
            PATH_WITH_BUILDING_EAST, tmp_path, "Path Start", "Path End"
        )
        building = next(e for e in extents if e["name"] == "Test Building")
        assert building["side"] == "right"

    def test_begins_before_ends(self, tmp_path):
        extents = _extents(
            PATH_WITH_BUILDING_EAST, tmp_path, "Path Start", "Path End"
        )
        for e in extents:
            assert e["begins_m"] <= e["ends_m"]
            assert e["length_m"] > 0


class TestPairedBuildings:
    def test_both_buildings_detected(self, tmp_path):
        extents = _extents(
            PAIR_OF_BUILDINGS, tmp_path, "Pair Start", "Pair End"
        )
        names = sorted(e["name"] for e in extents)
        assert names == ["Left Hall", "Right Hall"]

    def test_opposite_sides(self, tmp_path):
        extents = _extents(
            PAIR_OF_BUILDINGS, tmp_path, "Pair Start", "Pair End"
        )
        left = next(e for e in extents if e["name"] == "Left Hall")
        right = next(e for e in extents if e["name"] == "Right Hall")
        assert left["side"] == "left"
        assert right["side"] == "right"

    def test_begins_m_within_a_few_metres(self, tmp_path):
        # The two buildings start at the same latitude, so their begins_m
        # should be very close — this is the bug the redesign fixed.
        extents = _extents(
            PAIR_OF_BUILDINGS, tmp_path, "Pair Start", "Pair End"
        )
        left = next(e for e in extents if e["name"] == "Left Hall")
        right = next(e for e in extents if e["name"] == "Right Hall")
        assert abs(left["begins_m"] - right["begins_m"]) < 5