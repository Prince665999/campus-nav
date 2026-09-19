"""
Tests for the pure geometry helpers in campus_graph.py.

These are the functions that everything else depends on — if
haversine_m or bearing_deg drifts, every distance and direction in
the narration is wrong. Lock them down here.
"""

import math
import pytest

from campus_graph import (
    haversine_m,
    bearing_deg,
    point_segment_info,
    point_in_polygon,
    closest_point_on_polygon,
    densify_polygon,
)


# ---------------------------------------------------------------------------
# haversine_m
# ---------------------------------------------------------------------------

class TestHaversine:
    def test_identical_points_zero_distance(self):
        d = haversine_m(-6.75, 39.20, -6.75, 39.20)
        assert d == pytest.approx(0.0, abs=1e-6)

    def test_one_degree_latitude_is_about_111km(self):
        # One degree of latitude is ~111.1 km anywhere on Earth.
        d = haversine_m(0.0, 0.0, 1.0, 0.0)
        assert d == pytest.approx(111_195, rel=0.001)

    def test_small_campus_scale_distance(self):
        # ~55.6m north of the equator, since 0.0005 deg lat ≈ 55.6 m.
        d = haversine_m(-6.7500, 39.2000, -6.7495, 39.2000)
        assert d == pytest.approx(55.6, rel=0.01)

    def test_symmetry(self):
        d1 = haversine_m(-6.7500, 39.2000, -6.7490, 39.2005)
        d2 = haversine_m(-6.7490, 39.2005, -6.7500, 39.2000)
        assert d1 == pytest.approx(d2, rel=1e-9)


# ---------------------------------------------------------------------------
# bearing_deg
# ---------------------------------------------------------------------------

class TestBearing:
    def test_due_north_is_zero(self):
        b = bearing_deg(0.0, 0.0, 1.0, 0.0)
        assert b == pytest.approx(0.0, abs=0.1)

    def test_due_east_is_ninety(self):
        b = bearing_deg(0.0, 0.0, 0.0, 1.0)
        assert b == pytest.approx(90.0, abs=0.1)

    def test_due_south_is_one_eighty(self):
        b = bearing_deg(1.0, 0.0, 0.0, 0.0)
        assert b == pytest.approx(180.0, abs=0.1)

    def test_due_west_is_two_seventy(self):
        b = bearing_deg(0.0, 1.0, 0.0, 0.0)
        assert b == pytest.approx(270.0, abs=0.1)

    def test_always_in_range(self):
        # Fuzz a few random points and confirm the output is 0..360.
        for lat1, lon1, lat2, lon2 in [
            (-6.75, 39.20, -6.74, 39.19),
            (-6.75, 39.20, -6.76, 39.21),
            (-6.75, 39.20, -6.75, 39.19),
            (-6.75, 39.20, -6.75, 39.21),
        ]:
            b = bearing_deg(lat1, lon1, lat2, lon2)
            assert 0.0 <= b < 360.0


# ---------------------------------------------------------------------------
# point_segment_info
# ---------------------------------------------------------------------------

class TestPointSegmentInfo:
    def test_point_on_the_segment_has_zero_distance(self):
        # Point exactly at the midpoint of a north-running segment.
        p = (-6.7495, 39.2000)
        a = (-6.7500, 39.2000)
        b = (-6.7490, 39.2000)
        dist, t, side = point_segment_info(p, a, b)
        assert dist == pytest.approx(0.0, abs=0.5)
        assert t == pytest.approx(0.5, abs=0.01)

    def test_point_beside_the_segment_has_expected_distance(self):
        # ~10m east of a north-running segment.
        # 0.0001 deg lon at this latitude ≈ 11.1 m.
        p = (-6.7495, 39.20010)
        a = (-6.7500, 39.2000)
        b = (-6.7490, 39.2000)
        dist, t, side = point_segment_info(p, a, b)
        assert dist == pytest.approx(11.0, rel=0.15)
        assert side == "right"

    def test_point_west_of_north_running_segment_is_left(self):
        p = (-6.7495, 39.19990)
        a = (-6.7500, 39.2000)
        b = (-6.7490, 39.2000)
        _dist, _t, side = point_segment_info(p, a, b)
        assert side == "left"

    def test_point_before_segment_clamps_to_start(self):
        # Point well south of the segment start.
        p = (-6.7510, 39.2000)
        a = (-6.7500, 39.2000)
        b = (-6.7490, 39.2000)
        _dist, t, _side = point_segment_info(p, a, b)
        assert t == pytest.approx(0.0, abs=1e-6)

    def test_point_beyond_segment_clamps_to_end(self):
        p = (-6.7480, 39.2000)
        a = (-6.7500, 39.2000)
        b = (-6.7490, 39.2000)
        _dist, t, _side = point_segment_info(p, a, b)
        assert t == pytest.approx(1.0, abs=1e-6)

    def test_degenerate_segment_does_not_crash(self):
        # Zero-length segment: a and b are the same point.
        p = (-6.7495, 39.2000)
        a = (-6.7500, 39.2000)
        dist, t, side = point_segment_info(p, a, a)
        assert dist > 0
        assert t == 0.0
        assert side in ("left", "right")


# ---------------------------------------------------------------------------
# point_in_polygon
# ---------------------------------------------------------------------------

class TestPointInPolygon:
    def test_square_point_inside(self):
        square = [
            (-6.7500, 39.2000),
            (-6.7500, 39.2010),
            (-6.7490, 39.2010),
            (-6.7490, 39.2000),
        ]
        assert point_in_polygon((-6.7495, 39.2005), square) is True

    def test_square_point_outside(self):
        square = [
            (-6.7500, 39.2000),
            (-6.7500, 39.2010),
            (-6.7490, 39.2010),
            (-6.7490, 39.2000),
        ]
        assert point_in_polygon((-6.7495, 39.1990), square) is False
        assert point_in_polygon((-6.7510, 39.2005), square) is False


# ---------------------------------------------------------------------------
# closest_point_on_polygon
# ---------------------------------------------------------------------------

class TestClosestPointOnPolygon:
    def test_point_directly_beside_a_wall(self):
        # Square building. Point 10m west of the western wall.
        square = [
            (-6.7500, 39.2000),
            (-6.7500, 39.2005),
            (-6.7495, 39.2005),
            (-6.7495, 39.2000),
        ]
        p = (-6.74975, 39.19995)
        dist, ll = closest_point_on_polygon(p, square)
        # Should be ~5m to the western wall.
        assert dist < 12
        # And the returned lat/lon should be roughly on that wall.
        assert ll[1] == pytest.approx(39.2000, abs=1e-3)


# ---------------------------------------------------------------------------
# densify_polygon
# ---------------------------------------------------------------------------

class TestDensifyPolygon:
    def test_returns_points_along_every_edge(self):
        square = [
            (-6.7500, 39.2000),
            (-6.7500, 39.2005),
            (-6.7495, 39.2005),
            (-6.7495, 39.2000),
        ]
        # Each edge is ~55m; densifying at 2m should give ~28 points per edge.
        pts = densify_polygon(square, step_m=2.0)
        assert len(pts) > 50
        # All returned points should be inside the bounding box.
        for lat, lon in pts:
            assert -6.7501 <= lat <= -6.7494
            assert 39.1999 <= lon <= 39.2006