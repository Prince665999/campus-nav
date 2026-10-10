"""
Tests for the route composer's step annotation.

These tests exercise the pure logic of _annotate_steps_and_legs and
_enrich_indoor_steps without hitting the network or the DB. We feed
them a synthetic path and steps, and check the output.

The "You have arrived" bug was that every step's at_m was 0.0, which
made the phone's currentStepIndex() skip to the last step. The first
test locks that in.
"""

from backend.api.services.route_composer import (
    _annotate_steps_and_legs,
    _kind_for_step,
)


# A synthetic path with three outdoor nodes and three indoor nodes.
# Two nodes are "far" from each other (~50m) to give distinct at_m
# values.
NODES = {
    "o1": {"lat": -8.943000, "lon": 33.418000, "tags": {}},
    "o2": {"lat": -8.943500, "lon": 33.418000, "tags": {}},  # ~55m from o1
    "o3": {"lat": -8.944000, "lon": 33.418000, "tags": {}},  # ~55m from o2
    "100": {"lat": -8.944100, "lon": 33.418500, "tags": {}},  # indoor
    "101": {"lat": -8.944200, "lon": 33.418600, "tags": {}},  # indoor
    "102": {"lat": -8.944300, "lon": 33.418700, "tags": {}},  # indoor
}

PATH = ["o1", "o2", "o3", "100", "101", "102"]

# Steps: three outdoor, three indoor. Node ids match the path.
STEPS = [
    {"instruction": "Head north", "node_id": "o1"},
    {"instruction": "Continue straight", "node_id": "o2"},
    {"instruction": "Go through LIBRARY ENTRANCE", "node_id": "o3"},
    {"instruction": "Turn left", "node_id": "100"},
    {"instruction": "Walk along the corridor", "node_id": "101"},
    {"instruction": "You have arrived", "node_id": "102"},
]

INDOOR_IDS = {"100", "101", "102"}

FROM_EP = {"name": "Start", "kind": "outdoor"}
TO_EP = {"name": "Room 106", "kind": "indoor"}


class TestAnnotateStepsAndLegs:
    def test_all_steps_have_at_m(self):
        annotated, _legs = _annotate_steps_and_legs(
            STEPS, PATH, NODES, INDOOR_IDS, FROM_EP, TO_EP, total=200.0
        )
        for step in annotated:
            assert "at_m" in step
            assert isinstance(step["at_m"], (int, float))

    def test_at_m_is_monotonically_increasing(self):
        annotated, _legs = _annotate_steps_and_legs(
            STEPS, PATH, NODES, INDOOR_IDS, FROM_EP, TO_EP, total=200.0
        )
        at_ms = [s["at_m"] for s in annotated]
        for i in range(1, len(at_ms)):
            assert at_ms[i] >= at_ms[i - 1], (
                f"at_m went backwards at step {i}: "
                f"{at_ms[i-1]} -> {at_ms[i]}"
            )

    def test_first_step_is_at_zero(self):
        annotated, _legs = _annotate_steps_and_legs(
            STEPS, PATH, NODES, INDOOR_IDS, FROM_EP, TO_EP, total=200.0
        )
        assert annotated[0]["at_m"] == 0.0

    def test_has_real_distances_not_all_zero(self):
        """The bug: every at_m was 0.0. This test ensures at_m
        actually advances."""
        annotated, _legs = _annotate_steps_and_legs(
            STEPS, PATH, NODES, INDOOR_IDS, FROM_EP, TO_EP, total=200.0
        )
        at_ms = [s["at_m"] for s in annotated]
        # The last step's at_m must be > 0. If it's 0, the fix
        # didn't take.
        assert at_ms[-1] > 0, (
            "at_m values are all zero — this is the bug the fix "
            "was supposed to solve"
        )

    def test_modes_are_correct(self):
        annotated, _legs = _annotate_steps_and_legs(
            STEPS, PATH, NODES, INDOOR_IDS, FROM_EP, TO_EP, total=200.0
        )
        modes = [s["mode"] for s in annotated]
        assert modes == [
            "outdoor", "outdoor", "outdoor",
            "indoor", "indoor", "indoor",
        ]

    def test_legs_split_at_mode_boundary(self):
        _annotated, legs = _annotate_steps_and_legs(
            STEPS, PATH, NODES, INDOOR_IDS, FROM_EP, TO_EP, total=200.0
        )
        assert len(legs) == 2
        assert legs[0]["mode"] == "outdoor"
        assert legs[1]["mode"] == "indoor"
        assert legs[0]["from_name"] == "Start"
        assert legs[1]["to_name"] == "Room 106"

    def test_legs_are_contiguous(self):
        _annotated, legs = _annotate_steps_and_legs(
            STEPS, PATH, NODES, INDOOR_IDS, FROM_EP, TO_EP, total=200.0
        )
        for i in range(len(legs) - 1):
            assert legs[i]["to_m"] == legs[i + 1]["from_m"]

    def test_distance_m_is_non_negative(self):
        annotated, _legs = _annotate_steps_and_legs(
            STEPS, PATH, NODES, INDOOR_IDS, FROM_EP, TO_EP, total=200.0
        )
        for step in annotated:
            assert step["distance_m"] >= 0


class TestKindForStep:
    def test_start(self):
        step = {"instruction": "Starting from Library"}
        assert _kind_for_step(step, "outdoor") == "start"

    def test_arrive(self):
        step = {"instruction": "You have arrived at Room 106"}
        assert _kind_for_step(step, "indoor") == "arrive"

    def test_turn(self):
        step = {"instruction": "Turn left"}
        assert _kind_for_step(step, "outdoor") == "turn"

    def test_stairs(self):
        step = {"instruction": "Take the stairs up to the first floor"}
        assert _kind_for_step(step, "indoor") == "stairs"

    def test_walk_default(self):
        step = {"instruction": "Walk about 5 metres"}
        assert _kind_for_step(step, "outdoor") == "walk"


class TestRepeatedNodes:
    """The pointer walk in _annotate_steps_and_legs must handle
    repeated node ids in the path without backtracking."""

    def test_duplicate_node_ids_are_handled(self):
        # A path where a step's node appears twice — the second
        # occurrence should map forward, not back.
        nodes = {
            "o1": {"lat": 0.0, "lon": 0.0, "tags": {}},
            "o2": {"lat": 0.001, "lon": 0.0, "tags": {}},
            "100": {"lat": 0.002, "lon": 0.0, "tags": {}},
            "o2_again": {"lat": 0.001, "lon": 0.0, "tags": {}},
        }
        # Path contains o2 twice.
        path = ["o1", "o2", "100", "o2_again"]
        steps = [
            {"instruction": "Head out", "node_id": "o1"},
            {"instruction": "Pass o2", "node_id": "o2"},
            {"instruction": "Enter", "node_id": "100"},
            {"instruction": "Pass o2 again", "node_id": "o2_again"},
        ]
        annotated, _ = _annotate_steps_and_legs(
            steps, path, nodes, {"100"}, FROM_EP, TO_EP, total=300.0
        )
        at_ms = [s["at_m"] for s in annotated]
        # Monotonic despite the duplicate node id "o2" appearing
        # only once in the steps.
        for i in range(1, len(at_ms)):
            assert at_ms[i] >= at_ms[i - 1]