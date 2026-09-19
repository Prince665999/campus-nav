"""
Tests for validator.py.

Each test builds a small fake timeline and a fake narration, then
asserts that the validator accepts or rejects it as expected. No map
parsing, no API calls — the validator is pure logic over strings.
"""

from validator import validate


# ---------------------------------------------------------------------------
# A minimal timeline used by most tests. Its shape mirrors what
# build_timeline actually produces: (at_m, kind, detail, spoken).
# ---------------------------------------------------------------------------
TIMELINE = [
    (0.0, "TURN", "Head north from Library", "Head north from Library"),
    (30.0, "TURN", "Continue for about 30 meters, then turn right",
     "Continue for about 30 meters, then turn right"),
    (75.0, "AREA",
     "Science Block starts straight ahead of you and you pass it on your right "
     "(from about 75 to about 110 meters in, so about 35 meters alongside you)",
     "Science Block sits straight ahead of you, and you'll pass it on your right"),
    (180.0, "AREA",
     "Cafeteria starts ahead on your left (from about 180 to about 210 meters in, "
     "so about 30 meters alongside you)",
     "Cafeteria starts ahead on your left"),
    (240.0, "DESTINATION",
     "THIS IS THE DESTINATION (Hostel B), straight ahead as you come up to it",
     "that's Hostel B right there, straight ahead"),
]

START = "Library"
END = "Hostel B"


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------

class TestAccept:
    def test_clean_narration_passes(self):
        narration = (
            "Head north from Library for about 30 meters, then turn right. "
            "Science Block sits straight ahead of you on your right for about "
            "35 meters. Later, Cafeteria is ahead on your left for about "
            "30 meters. And there it is — Hostel B, straight ahead."
        )
        ok, reason = validate(narration, TIMELINE, START, END)
        assert ok, reason

    def test_empty_timeline_is_treated_as_pass(self):
        ok, _reason = validate("Anything goes here.", [])
        assert ok


# ---------------------------------------------------------------------------
# Rejections
# ---------------------------------------------------------------------------

class TestRejectInventedName:
    def test_invented_building_is_caught(self):
        narration = (
            "Head north from Library. After 30 meters turn right. "
            "You'll pass Engineering Tower on your right, then "
            "Cafeteria on your left."
        )
        ok, reason = validate(narration, TIMELINE, START, END)
        assert not ok
        assert "Engineering" in reason or "Tower" in reason


class TestRejectInventedDistance:
    def test_invented_distance_is_caught(self):
        narration = (
            "Head north from Library for about 999 meters, then turn right. "
            "Science Block is on your right."
        )
        ok, reason = validate(narration, TIMELINE, START, END)
        assert not ok
        assert "999" in reason

    def test_rounding_within_tolerance_passes(self):
        narration = (
            "Head north from Library for about 33 meters, then turn right. "
            "Science Block is on your right for a while. Cafeteria later. "
            "Hostel B straight ahead."
        )
        ok, reason = validate(narration, TIMELINE, START, END)
        assert ok, reason


class TestRejectOutOfOrder:
    def test_cafeteria_mentioned_before_science_block(self):
        narration = (
            "Head north from Library. Turn right after 30 meters. "
            "Cafeteria is ahead on your left, and later Science Block is "
            "on your right. Finally, Hostel B straight ahead."
        )
        ok, reason = validate(narration, TIMELINE, START, END)
        assert not ok
        assert "order" in reason


class TestEmptyNarration:
    def test_empty_string_is_rejected(self):
        ok, reason = validate("", TIMELINE)
        assert not ok
        assert "empty" in reason.lower()

    def test_whitespace_only_is_rejected(self):
        ok, _reason = validate("   \n\t  ", TIMELINE)
        assert not ok