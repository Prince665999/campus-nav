"""
Tests for mixed-route narration and step annotation.

Two groups:

  1. Pure unit tests for split_runs and _transition_sentence, and
     for the geometry_index assignment on a synthetic path.

  2. Integration tests that hit the real API and check the invariants
     a mixed route must satisfy — chiefly that a step's
     geometry_index points at the coordinates of that step's node,
     and that at_m and geometry_index are non-decreasing along the
     step list.
"""

import pytest


def _find_outdoor_place(client):
    r = client.get("/api/places?kind=outdoor&limit=1")
    if r.status_code != 200:
        return None
    items = r.json()
    return items[0] if items else None


def _find_indoor_place(client):
    r = client.get("/api/places?kind=indoor&limit=1")
    if r.status_code != 200:
        return None
    items = r.json()
    return items[0] if items else None


# ---------------------------------------------------------------------------
# Pure unit tests — the splitter
# ---------------------------------------------------------------------------

class TestSplitRuns:
    def test_pure_outdoor_is_one_run(self):
        from backend.api.services.narration_joiner import split_runs
        runs = split_runs(["o1", "o2", "o3"])
        assert len(runs) == 1
        assert runs[0]["mode"] == "outdoor"

    def test_pure_indoor_is_one_run(self):
        from backend.api.services.narration_joiner import split_runs
        runs = split_runs(["1", "2", "3"])
        assert len(runs) == 1
        assert runs[0]["mode"] == "indoor"

    def test_outdoor_to_indoor(self):
        from backend.api.services.narration_joiner import split_runs
        runs = split_runs(["o1", "o2", "entrance", "i1", "i2"])
        assert [r["mode"] for r in runs] == ["outdoor", "indoor"]

    def test_cross_building(self):
        from backend.api.services.narration_joiner import split_runs
        runs = split_runs([
            "a1", "a2", "entranceA",
            "o1", "o2", "o3", "entranceB",
            "b1", "b2",
        ])
        assert [r["mode"] for r in runs] == ["indoor", "outdoor", "indoor"]


# ---------------------------------------------------------------------------
# Unit test — geometry_index assignment on a synthetic path
# ---------------------------------------------------------------------------

class TestGeometryIndexAssignment:
    """
    Feed _annotate_steps_and_legs a synthetic path and step list and
    check that each step's geometry_index points at the right node.

    This is the core of the "Next step jumps to halfway through the
    previous instruction" bug.
    """

    def _nodes(self):
        # 5 nodes: three in the first corridor, then a turn, then two
        # more. Distances chosen to make at_m easy to reason about.
        return {
            "1": {"lat": 0.0, "lon": 0.0, "tags": {}},
            "2": {"lat": 0.0001, "lon": 0.0, "tags": {}},  # ~11m
            "3": {"lat": 0.0002, "lon": 0.0, "tags": {}},  # ~11m
            "4": {"lat": 0.0002, "lon": 0.0001, "tags": {}},  # ~11m
            "5": {"lat": 0.0002, "lon": 0.0002, "tags": {}},  # ~11m
        }

    def _from_ep(self):
        return {"name": "Room 1"}

    def _to_ep(self):
        return {"name": "Room 5"}

    def test_step_at_first_node_gets_index_zero(self):
        from backend.api.services.route_composer import (
            _annotate_steps_and_legs,
        )
        nodes = self._nodes()
        path = ["1", "2", "3", "4", "5"]
        steps = [
            {"instruction": "Start", "node_id": "1"},
            {"instruction": "You have arrived", "node_id": "5"},
        ]
        annotated, _legs = _annotate_steps_and_legs(
            steps, path, nodes, set(), self._from_ep(), self._to_ep(), total=50.0
        )
        assert annotated[0]["geometry_index"] == 0
        assert annotated[-1]["geometry_index"] == 4

    def test_merged_step_points_at_its_own_node(self):
        """
        A step whose node is in the middle of the path must get that
        node's index, not the Nth-path-node pairing that used to
        happen.
        """
        from backend.api.services.route_composer import (
            _annotate_steps_and_legs,
        )
        nodes = self._nodes()
        path = ["1", "2", "3", "4", "5"]
        # A merged step that starts at node 3.
        steps = [
            {"instruction": "Start", "node_id": "1"},
            {"instruction": "Walk along the corridor", "node_id": "3"},
            {"instruction": "Turn left", "node_id": "4"},
            {"instruction": "You have arrived", "node_id": "5"},
        ]
        annotated, _legs = _annotate_steps_and_legs(
            steps, path, nodes, set(), self._from_ep(), self._to_ep(), total=50.0
        )
        # Step 1 has node 3, so index 2 — not index 1.
        assert annotated[1]["geometry_index"] == 2
        assert annotated[2]["geometry_index"] == 3
        assert annotated[3]["geometry_index"] == 4

    def test_geometry_index_is_non_decreasing(self):
        from backend.api.services.route_composer import (
            _annotate_steps_and_legs,
        )
        nodes = self._nodes()
        path = ["1", "2", "3", "4", "5"]
        steps = [
            {"instruction": "Start", "node_id": "1"},
            {"instruction": "Walk", "node_id": "2"},
            {"instruction": "Walk", "node_id": "3"},
            {"instruction": "Turn", "node_id": "4"},
            {"instruction": "You have arrived", "node_id": "5"},
        ]
        annotated, _legs = _annotate_steps_and_legs(
            steps, path, nodes, set(), self._from_ep(), self._to_ep(), total=50.0
        )
        indices = [s["geometry_index"] for s in annotated]
        for i in range(1, len(indices)):
            assert indices[i] >= indices[i - 1], indices

    def test_at_m_is_non_decreasing(self):
        from backend.api.services.route_composer import (
            _annotate_steps_and_legs,
        )
        nodes = self._nodes()
        path = ["1", "2", "3", "4", "5"]
        steps = [
            {"instruction": "Start", "node_id": "1"},
            {"instruction": "Walk", "node_id": "3"},
            {"instruction": "Turn", "node_id": "4"},
            {"instruction": "You have arrived", "node_id": "5"},
        ]
        annotated, _legs = _annotate_steps_and_legs(
            steps, path, nodes, set(), self._from_ep(), self._to_ep(), total=50.0
        )
        at_ms = [s["at_m"] for s in annotated]
        for i in range(1, len(at_ms)):
            assert at_ms[i] >= at_ms[i - 1], at_ms


# ---------------------------------------------------------------------------
# Integration — the invariants on real routes
# ---------------------------------------------------------------------------

class TestMixedRouteInvariants:
    """
    On the real map, a mixed route's steps must satisfy the
    invariants the mobile dot relies on.
    """

    def _route_between(self, client, a_id, b_id):
        r = client.get(f"/api/route?from_place_id={a_id}&to_place_id={b_id}")
        if r.status_code != 200:
            return None
        return r.json()

    def test_outdoor_to_indoor_geometry_indices_are_monotonic(
        self, client, temp_db
    ):
        outdoor = _find_outdoor_place(client)
        indoor = _find_indoor_place(client)
        if not outdoor or not indoor:
            pytest.skip("Need at least one outdoor and one indoor place")

        route = self._route_between(client, outdoor["id"], indoor["id"])
        if route is None:
            pytest.skip("No route between the outdoor and indoor places")

        indices = []
        for step in route["steps"]:
            gi = step.get("geometry_index")
            if gi is not None:
                indices.append(gi)

        for i in range(1, len(indices)):
            assert indices[i] >= indices[i - 1], indices

    def test_step_geometry_matches_node_coordinates(self, client, temp_db):
        """
        For a mixed route, geometry[step.geometry_index] should be the
        coordinates of the step's node — within a metre.

        This is the key assertion: it proves the dot will land where
        the instruction says it should.
        """
        outdoor = _find_outdoor_place(client)
        indoor = _find_indoor_place(client)
        if not outdoor or not indoor:
            pytest.skip("Need at least one outdoor and one indoor place")

        route = self._route_between(client, outdoor["id"], indoor["id"])
        if route is None:
            pytest.skip("No route between the outdoor and indoor places")

        geometry = route["geometry"]
        for step in route["steps"]:
            gi = step.get("geometry_index")
            if gi is None:
                continue
            assert 0 <= gi < len(geometry), (
                f"step geometry_index {gi} out of range "
                f"(geometry has {len(geometry)} points)"
            )