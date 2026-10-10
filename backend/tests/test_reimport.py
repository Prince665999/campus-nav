"""
Tests for the merge-safe re-import.

The critical property: re-import must never overwrite a field that was
set by hand in the database and is not present as an OSM tag.

After the description split:
  - Public `description` is admin-only. Re-import never writes to it.
  - AI `description_ai` is OSM-sourced, but a hand edit survives unless
    the OSM tag is present.

The tests pass an explicit `indoor_osm_path` that doesn't exist, so
the indoor ingest is skipped. Without this, the real final.osm is
ingested alongside the synthetic outdoor map, and the assertions on
total row counts fail.
"""

import pytest

from backend.core.tests.fixtures.synthetic_maps import (
    STRAIGHT_PATH_NORTH,
    write_temp_map,
)


def _outdoor_only(tmp_path):
    """A path that doesn't exist, used to skip indoor ingest."""
    return tmp_path / "no_indoor.osm"


class TestReimportPreservesManualEdits:
    def test_manual_public_description_survives(self, temp_db, tmp_path):
        """The public description is admin-only. Re-import must never
        touch it, even if a description tag is present in OSM."""
        from backend.api.db.session import session_scope
        from backend.api.models.place import Place
        from backend.pipeline.ingest import run_ingest
        from backend.pipeline.reimport import run_reimport

        osm_path = write_temp_map(STRAIGHT_PATH_NORTH, tmp_path)

        run_ingest(
            osm_path=osm_path,
            indoor_osm_path=_outdoor_only(tmp_path),
            replace=True,
        )

        with session_scope() as session:
            row = session.query(Place).filter_by(name="Start Point").one()
            row.description = "A formal public description for students"
            session.add(row)

        run_reimport(osm_path=osm_path)

        with session_scope() as session:
            row = session.query(Place).filter_by(name="Start Point").one()
            assert row.description == "A formal public description for students"

    def test_osm_description_overwrites_ai_description(self, temp_db, tmp_path):
        """When the OSM tag is present, it wins for the AI description."""
        from backend.api.db.session import session_scope
        from backend.api.models.place import Place
        from backend.pipeline.ingest import run_ingest
        from backend.pipeline.reimport import run_reimport

        osm_content = """<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6">
  <node id="1" lat="-6.7500" lon="39.2000">
    <tag k="name" v="Start Point"/>
    <tag k="description" v="From OSM"/>
  </node>
  <node id="2" lat="-6.7490" lon="39.2000">
    <tag k="name" v="End Point"/>
  </node>
  <way id="100">
    <nd ref="1"/>
    <nd ref="2"/>
    <tag k="highway" v="footway"/>
  </way>
</osm>
"""
        osm_path = write_temp_map(osm_content, tmp_path)
        run_ingest(
            osm_path=osm_path,
            indoor_osm_path=_outdoor_only(tmp_path),
            replace=True,
        )

        with session_scope() as session:
            row = session.query(Place).filter_by(name="Start Point").one()
            row.description_ai = "Manually set"
            session.add(row)

        run_reimport(osm_path=osm_path)

        with session_scope() as session:
            row = session.query(Place).filter_by(name="Start Point").one()
            assert row.description_ai == "From OSM"

    def test_manual_ai_description_survives_when_no_osm_tag(self, temp_db, tmp_path):
        """When there's no OSM description tag, a hand edit to the AI
        description must survive a re-import."""
        from backend.api.db.session import session_scope
        from backend.api.models.place import Place
        from backend.pipeline.ingest import run_ingest
        from backend.pipeline.reimport import run_reimport

        osm_content = """<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6">
  <node id="1" lat="-6.7500" lon="39.2000">
    <tag k="name" v="Start Point"/>
  </node>
  <node id="2" lat="-6.7490" lon="39.2000">
    <tag k="name" v="End Point"/>
  </node>
  <way id="100">
    <nd ref="1"/>
    <nd ref="2"/>
    <tag k="highway" v="footway"/>
  </way>
</osm>
"""
        osm_path = write_temp_map(osm_content, tmp_path)
        run_ingest(
            osm_path=osm_path,
            indoor_osm_path=_outdoor_only(tmp_path),
            replace=True,
        )

        with session_scope() as session:
            row = session.query(Place).filter_by(name="Start Point").one()
            row.description_ai = "The big mango tree is on the left"
            session.add(row)

        run_reimport(osm_path=osm_path)

        with session_scope() as session:
            row = session.query(Place).filter_by(name="Start Point").one()
            assert row.description_ai == "The big mango tree is on the left"


class TestReimportNeverDeletes:
    def test_row_not_in_new_map_survives(self, temp_db, tmp_path):
        from backend.api.db.session import session_scope
        from backend.api.models.place import Place
        from backend.pipeline.ingest import run_ingest
        from backend.pipeline.reimport import run_reimport

        # Ingest a map with two places.
        osm_path = write_temp_map(STRAIGHT_PATH_NORTH, tmp_path)
        run_ingest(
            osm_path=osm_path,
            indoor_osm_path=_outdoor_only(tmp_path),
            replace=True,
        )

        # Now re-import an empty map (no named nodes at all).
        empty_map = """<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6">
</osm>
"""
        empty_path = write_temp_map(empty_map, tmp_path, name="empty.osm")
        run_reimport(osm_path=empty_path)

        # Both original places must still exist.
        with session_scope() as session:
            count = session.query(Place).count()
        assert count == 2