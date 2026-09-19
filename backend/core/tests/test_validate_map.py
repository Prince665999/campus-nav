"""
Tests for validate_map.py.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "core" / "tests"))
from fixtures.synthetic_maps import (  # noqa: E402
    STRAIGHT_PATH_NORTH,
    write_temp_map,
)


class TestValidateMapClean:
    def test_clean_map_reports_no_issues(self, tmp_path):
        from backend.pipeline.validate_map import validate_map

        osm_path = write_temp_map(STRAIGHT_PATH_NORTH, tmp_path)
        issues = validate_map(osm_path)
        assert issues.is_clean
        assert issues.dangling_refs == []
        assert issues.duplicate_ids == []


class TestValidateMapCatchesProblems:
    def test_dangling_ref_detected(self, tmp_path):
        from backend.pipeline.validate_map import validate_map

        bad = """<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6">
  <node id="1" lat="-6.75" lon="39.20"/>
  <way id="100">
    <nd ref="1"/>
    <nd ref="999"/>
    <tag k="highway" v="footway"/>
  </way>
</osm>
"""
        osm_path = write_temp_map(bad, tmp_path)
        issues = validate_map(osm_path)
        assert not issues.is_clean
        assert any("999" in ref for ref in issues.dangling_refs)

    def test_short_way_detected(self, tmp_path):
        from backend.pipeline.validate_map import validate_map

        bad = """<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6">
  <node id="1" lat="-6.75" lon="39.20"/>
  <way id="100">
    <nd ref="1"/>
    <tag k="highway" v="footway"/>
  </way>
</osm>
"""
        osm_path = write_temp_map(bad, tmp_path)
        issues = validate_map(osm_path)
        assert not issues.is_clean
        assert "100" in issues.short_ways

    def test_named_node_not_on_path_flagged(self, tmp_path):
        from backend.pipeline.validate_map import validate_map

        bad = """<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6">
  <node id="1" lat="-6.75" lon="39.20">
    <tag k="name" v="Lonely Building"/>
  </node>
</osm>
"""
        osm_path = write_temp_map(bad, tmp_path)
        issues = validate_map(osm_path)
        assert "Lonely Building" in issues.named_but_unroutable