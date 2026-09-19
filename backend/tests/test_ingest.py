"""
Tests for the ingestion pipeline.

Uses the synthetic maps from the core tests as input so the pipeline
is exercised on a known, deterministic map.
"""

import pytest

from backend.core.tests.fixtures.synthetic_maps import (
    PATH_WITH_BUILDING_EAST,
    STRAIGHT_PATH_NORTH,
    write_temp_map,
)


class TestIngestBasic:
    def test_ingest_creates_places(self, temp_db, tmp_path):
        from backend.api.db.session import session_scope
        from backend.api.models.place import Place
        from backend.pipeline.ingest import run_ingest

        osm_path = write_temp_map(STRAIGHT_PATH_NORTH, tmp_path)
        run_ingest(osm_path=osm_path, replace=True)

        with session_scope() as session:
            names = sorted(p.name for p in session.query(Place).all())
        assert names == ["End Point", "Start Point"]

    def test_ingest_creates_edges(self, temp_db, tmp_path):
        from backend.api.db.session import session_scope
        from backend.api.models.path_edge import PathEdge
        from backend.pipeline.ingest import run_ingest

        osm_path = write_temp_map(STRAIGHT_PATH_NORTH, tmp_path)
        run_ingest(osm_path=osm_path, replace=True)

        with session_scope() as session:
            edges = session.query(PathEdge).all()
        # Three nodes, one way: two edges.
        assert len(edges) == 2

    def test_ingest_creates_areas(self, temp_db, tmp_path):
        from backend.api.db.session import session_scope
        from backend.api.models.area import Area
        from backend.pipeline.ingest import run_ingest

        osm_path = write_temp_map(PATH_WITH_BUILDING_EAST, tmp_path)
        run_ingest(osm_path=osm_path, replace=True)

        with session_scope() as session:
            areas = session.query(Area).all()
        assert len(areas) == 1
        assert areas[0].name == "Test Building"
        assert areas[0].geometry_wkt.startswith("POLYGON((")


class TestIngestIdempotent:
    def test_second_run_does_not_duplicate_places(self, temp_db, tmp_path):
        from backend.api.db.session import session_scope
        from backend.api.models.place import Place
        from backend.pipeline.ingest import run_ingest

        osm_path = write_temp_map(STRAIGHT_PATH_NORTH, tmp_path)
        run_ingest(osm_path=osm_path, replace=True)
        run_ingest(osm_path=osm_path, replace=False)

        with session_scope() as session:
            count = session.query(Place).count()
        assert count == 2