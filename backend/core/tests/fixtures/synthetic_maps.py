"""
Tiny hand-written OSM fragments used by the geometry and turn tests.

Every test that needs a map uses one of these instead of the real
map.osm. That keeps the tests fast, deterministic, and independent of
whatever the campus map happens to look like this week.

Each fixture is a string in OSM XML format, ready to be written to a
temp file and fed to parse_osm().
"""

# ---------------------------------------------------------------------------
# A single straight path running north, with two named endpoints.
# Three nodes total. Used for "no turns should be reported" tests.
# ---------------------------------------------------------------------------
STRAIGHT_PATH_NORTH = """<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6">
  <node id="1" lat="-6.7500" lon="39.2000">
    <tag k="name" v="Start Point"/>
  </node>
  <node id="2" lat="-6.7495" lon="39.2000"/>
  <node id="3" lat="-6.7490" lon="39.2000">
    <tag k="name" v="End Point"/>
  </node>
  <way id="100">
    <nd ref="1"/>
    <nd ref="2"/>
    <nd ref="3"/>
    <tag k="highway" v="footway"/>
  </way>
</osm>
"""

# ---------------------------------------------------------------------------
# A single 90-degree corner: walk north, then turn east.
# Four nodes. Used for "one turn should be reported at node 3" tests.
# ---------------------------------------------------------------------------
SINGLE_RIGHT_TURN = """<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6">
  <node id="1" lat="-6.7500" lon="39.2000">
    <tag k="name" v="Corner Start"/>
  </node>
  <node id="2" lat="-6.7495" lon="39.2000"/>
  <node id="3" lat="-6.7490" lon="39.2000"/>
  <node id="4" lat="-6.7490" lon="39.2005">
    <tag k="name" v="Corner End"/>
  </node>
  <way id="100">
    <nd ref="1"/>
    <nd ref="2"/>
    <nd ref="3"/>
    <nd ref="4"/>
    <tag k="highway" v="footway"/>
  </way>
</osm>
"""

# ---------------------------------------------------------------------------
# A path running north with a rectangular building to the east.
# Used for area_extents_along_route tests: the building should be
# detected as beginning alongside the walker and ending alongside them,
# and should be reported on the right-hand side.
#
# Building corners are ~10m east of the path, so it's within the 15m
# LANDMARK_RADIUS_M default.
# ---------------------------------------------------------------------------
PATH_WITH_BUILDING_EAST = """<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6">
  <node id="1" lat="-6.7500" lon="39.2000">
    <tag k="name" v="Path Start"/>
  </node>
  <node id="2" lat="-6.7495" lon="39.2000"/>
  <node id="3" lat="-6.7490" lon="39.2000">
    <tag k="name" v="Path End"/>
  </node>

  <!-- Building polygon, roughly 10m east of the path, running alongside -->
  <node id="10" lat="-6.7495" lon="39.20010"/>
  <node id="11" lat="-6.7495" lon="39.20025"/>
  <node id="12" lat="-6.7490" lon="39.20025"/>
  <node id="13" lat="-6.7490" lon="39.20010"/>

  <way id="100">
    <nd ref="1"/>
    <nd ref="2"/>
    <nd ref="3"/>
    <tag k="highway" v="footway"/>
  </way>

  <way id="200">
    <nd ref="10"/>
    <nd ref="11"/>
    <nd ref="12"/>
    <nd ref="13"/>
    <nd ref="10"/>
    <tag k="name" v="Test Building"/>
    <tag k="building" v="yes"/>
    <tag k="landmark" v="yes"/>
  </way>
</osm>
"""

# ---------------------------------------------------------------------------
# Two buildings facing each other across a path, starting at the same
# distance. Used for the pair_areas "BOTH SIDES AT ONCE" test.
# ---------------------------------------------------------------------------
PAIR_OF_BUILDINGS = """<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6">
  <node id="1" lat="-6.7500" lon="39.2000">
    <tag k="name" v="Pair Start"/>
  </node>
  <node id="2" lat="-6.7495" lon="39.2000"/>
  <node id="3" lat="-6.7490" lon="39.2000">
    <tag k="name" v="Pair End"/>
  </node>

  <!-- Left building (west of the path) -->
  <node id="10" lat="-6.7495" lon="39.19990"/>
  <node id="11" lat="-6.7495" lon="39.19980"/>
  <node id="12" lat="-6.7490" lon="39.19980"/>
  <node id="13" lat="-6.7490" lon="39.19990"/>

  <!-- Right building (east of the path) -->
  <node id="20" lat="-6.7495" lon="39.20010"/>
  <node id="21" lat="-6.7495" lon="39.20020"/>
  <node id="22" lat="-6.7490" lon="39.20020"/>
  <node id="23" lat="-6.7490" lon="39.20010"/>

  <way id="100">
    <nd ref="1"/>
    <nd ref="2"/>
    <nd ref="3"/>
    <tag k="highway" v="footway"/>
  </way>

  <way id="200">
    <nd ref="10"/>
    <nd ref="11"/>
    <nd ref="12"/>
    <nd ref="13"/>
    <nd ref="10"/>
    <tag k="name" v="Left Hall"/>
    <tag k="building" v="yes"/>
  </way>

  <way id="201">
    <nd ref="20"/>
    <nd ref="21"/>
    <nd ref="22"/>
    <nd ref="23"/>
    <nd ref="20"/>
    <tag k="name" v="Right Hall"/>
    <tag k="building" v="yes"/>
  </way>
</osm>
"""


def write_temp_map(content, tmp_path, name="map.osm"):
    """
    Write one of the fixtures above to a temp file and return its path.

    Usage inside a test:
        from fixtures.synthetic_maps import STRAIGHT_PATH_NORTH, write_temp_map
        osm_path = write_temp_map(STRAIGHT_PATH_NORTH, tmp_path)
    """
    path = tmp_path / name
    path.write_text(content, encoding="utf-8")
    return str(path)