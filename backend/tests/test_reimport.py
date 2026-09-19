"""
Tests for the merge-safe re-import.

The critical property: re-import must never overwrite a field that was
set by hand in the database and is not present as an OSM tag.
"""

import pytest

from backend.core.tests.fixtures.synthetic_maps import (
    STRAIGHT_PATH_NORTH,
    write_temp_map,
)


class TestReimportPreservesManualEdits:
    def test_manual_description_survives(self, temp_db, tmp_path):
        from backend.api.db.session import session_scope
        from backend.api.models.place import Place
        from backend.pipeline.ingest import run_ingest
        from backend.pipeline.reimport import run_reimport

        osm_path = write_temp_map(STRAIGHT_PATH_NORTH, tmp_path)

        # First ingest — clean database.
        run_ingest(osm_path=osm_path, replace=True)

        # Simulate a manual edit: someone set a description in the admin app.
        with session_scope() as session:
            row = session.query(Place).filter_by(name="Start Point").one()
            row.description = "Hand-written description that must survive"
            session.add(row)

        # Now re-import. The OSM file has no description tag, so the
        # manual value must survive.
        run_reimport(osm_path=osm_path)

        with session_scope() as session:
            row = session.query(Place).filter_by(name="Start Point").one()
            assert row.description == "Hand-written description that must survive"

    def test_osm_description_overwrites(self, temp_db, tmp_path):
        from backend.api.db.session import session_scope
        from backend.api.models.place import Place
        from backend.pipeline.ingest import run_ingest
        from backend.pipeline.reimport import run_reimport

        # A synthetic map where Start Point has a description tag.
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
        run_ingest(osm_path=osm_path, replace=True)

        with session_scope() as session:
            row = session.query(Place).filter_by(name="Start Point").one()
            row.description = "Manually set"
            session.add(row)

        run_reimport(osm_path=osm_path)

        with session_scope() as session:
            row = session.query(Place).filter_by(name="Start Point").one()
            # The OSM tag is present, so it wins.
            assert row.description == "From OSM"


class TestReimportNeverDeletes:
    def test_row_not_in_new_map_survives(self, temp_db, tmp_path):
        from backend.api.db.session import session_scope
        from backend.api.models.place import Place
        from backend.pipeline.ingest import run_ingest
        from backend.pipeline.reimport import run_reimport

        # Ingest a map with two places.
        osm_path = write_temp_map(STRAIGHT_PATH_NORTH, tmp_path)
        run_ingest(osm_path=osm_path, replace=True)

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