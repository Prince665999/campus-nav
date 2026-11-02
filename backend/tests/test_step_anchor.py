"""
Tests for step_merge.anchor_steps_to_leg_start.

Bug being guarded against: every instruction after the first was shown
one leg late. The engine pins "Continue for X, then turn left" to the
node where that leg ENDS; the app shows a step once the walker reaches
its at_m, so the text for leg N appeared during leg N+1.
"""

import importlib.util
from pathlib import Path

_PATH = (
    Path(__file__).resolve().parent.parent
    / "api" / "services" / "step_merge.py"
)
_spec = importlib.util.spec_from_file_location("step_merge_under_test", _PATH)
step_merge = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(step_merge)

anchor = step_merge.anchor_steps_to_leg_start


def _engine_steps():
    # Legs: 0-18 m, 18-98 m, 98-148 m, 148-200 m
    return [
        {"kind": "start", "instruction": "Head north from Gate",
         "at_m": 0.0, "distance_m": 0.0},
        {"kind": "turn", "instruction": "Continue for about 18 meters, then turn left",
         "at_m": 18.0, "distance_m": 18.0},
        {"kind": "turn", "instruction": "Continue for about 80 meters, then turn right",
         "at_m": 98.0, "distance_m": 80.0},
        {"kind": "turn", "instruction": "Continue for about 50 meters, then turn left",
         "at_m": 148.0, "distance_m": 50.0},
        {"kind": "arrive", "instruction": "Continue for about 52 meters and you'll arrive",
         "at_m": 200.0, "distance_m": 52.0},
    ]


def test_each_step_begins_where_its_leg_begins():
    out = anchor(_engine_steps())
    assert [s["at_m"] for s in out] == [0.0, 18.0, 98.0, 148.0]


def test_instruction_for_a_leg_is_active_while_walking_that_leg():
    out = anchor(_engine_steps())
    # Walking the 80 m leg (18 m -> 98 m) must show the 80 m instruction.
    active = [s for s in out if s["at_m"] <= 50.0][-1]
    assert "80 meters" in active["instruction"]


def test_first_instruction_still_merged_with_opening_heading():
    out = anchor(_engine_steps())
    assert out[0]["instruction"] == (
        "Head north from Gate, continue for about 18 meters, then turn left"
    )


def test_distances_and_kinds_are_untouched():
    out = anchor(_engine_steps())
    assert [s["distance_m"] for s in out] == [18.0, 80.0, 50.0, 52.0]
    assert [s["kind"] for s in out] == ["turn", "turn", "turn", "arrive"]


def test_at_m_never_decreases():
    at = [s["at_m"] for s in anchor(_engine_steps())]
    assert at == sorted(at)


def test_short_lists_pass_through():
    assert anchor([]) == []
    one = [{"kind": "start", "instruction": "x", "at_m": 0.0, "distance_m": 0.0}]
    assert anchor(one) == one