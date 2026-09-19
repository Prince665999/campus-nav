"""
Tests for the mention budget in narration.py.

The budget caps AREA mentions to roughly one per 40m of walking. It
never drops TURN, PATH, JUNCTION, or DESTINATION events, and when two
areas compete for the same stretch it keeps the one the walker spends
the longest time alongside.
"""

from narration import apply_mention_budget, _area_length_from_detail


def _area(at_m, name, length_m):
    """Build a fake AREA event whose detail text encodes its length."""
    detail = (
        name + " starts straight ahead of you "
        "(from about " + str(int(at_m)) + " to about "
        + str(int(at_m + length_m)) + " meters in, so about "
        + str(int(length_m)) + " meters alongside you)"
    )
    return (at_m, "AREA", detail, name)


class TestBudgetCapsDensity:
    def test_areas_far_apart_are_all_kept(self):
        events = [
            _area(10, "A", 20),
            _area(80, "B", 20),
            _area(150, "C", 20),
        ]
        result = apply_mention_budget(events, budget_m=40)
        kept = [e for e in result if e[1] == "AREA"]
        assert len(kept) == 3

    def test_areas_too_close_are_pruned(self):
        # All within 40m of each other — only one should survive.
        events = [
            _area(10, "A", 10),
            _area(20, "B", 10),
            _area(30, "C", 10),
        ]
        result = apply_mention_budget(events, budget_m=40)
        kept = [e for e in result if e[1] == "AREA"]
        assert len(kept) == 1


class TestBudgetKeepsLongerArea:
    def test_longer_stretch_wins(self):
        events = [
            _area(10, "Short", 5),
            _area(30, "Long", 25),
        ]
        result = apply_mention_budget(events, budget_m=40)
        kept = [e for e in result if e[1] == "AREA"]
        assert len(kept) == 1
        assert "Long" in kept[0][2]


class TestBudgetNeverDropsOtherKinds:
    def test_turn_path_junction_destination_survive(self):
        events = [
            (0.0, "TURN", "Head north", "Head north"),
            (5.0, "PATH", "path surface changes to gravel",
             "path surface changes to gravel"),
            (10.0, "AREA", "A starts (about 5 meters alongside you)",
             "A starts"),
            (20.0, "AREA", "B starts (about 5 meters alongside you)",
             "B starts"),
            (25.0, "JUNCTION", "another path branches off to your left",
             "another path branches off to your left"),
            (30.0, "DESTINATION", "THIS IS THE DESTINATION (X)",
             "that's X"),
        ]
        result = apply_mention_budget(events, budget_m=40)
        kinds = [e[1] for e in result]
        assert "TURN" in kinds
        assert "PATH" in kinds
        assert "JUNCTION" in kinds
        assert "DESTINATION" in kinds


class TestBudgetPreservesOrder:
    def test_output_is_sorted_by_distance(self):
        events = [
            _area(100, "Far", 10),
            _area(10, "Near", 10),
            (50.0, "TURN", "turn right", "turn right"),
            _area(300, "Further", 10),
        ]
        result = apply_mention_budget(events, budget_m=40)
        at_ms = [e[0] for e in result]
        assert at_ms == sorted(at_ms)


class TestLengthParser:
    def test_parses_about_n_meters(self):
        assert _area_length_from_detail("... about 35 meters alongside you") == 35

    def test_parses_bare_n_meters(self):
        assert _area_length_from_detail("you pass it for 20 meters") == 20

    def test_returns_zero_for_unknown_format(self):
        assert _area_length_from_detail("no length here") == 0