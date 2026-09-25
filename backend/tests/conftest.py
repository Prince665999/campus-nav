"""
conftest.py for backend-level tests (pipeline and API).

Provides a fresh SQLite database per test and a TestClient with a
seeded database. The sys.path setup now lives in pyproject.toml's
`pythonpath` setting.
"""

from pathlib import Path

import pytest

@pytest.fixture
def temp_db(tmp_path, monkeypatch):
    """
    Point DATABASE_URL, MEDIA_DIR, and CHROMA_DIR at temp locations
    for the duration of one test. Reloads settings and session so the
    engine is rebuilt against the new URLs, then creates the schema.
    """
    db_file = tmp_path / "test.db"
    media_dir = tmp_path / "media"
    chroma_dir = tmp_path / "chroma"
    media_dir.mkdir()
    chroma_dir.mkdir()

    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_file}")
    monkeypatch.setenv("MEDIA_DIR", str(media_dir))
    monkeypatch.setenv("CHROMA_DIR", str(chroma_dir))

    import importlib

    import backend.api.settings as settings_module
    import backend.api.db.session as session_module
    import backend.api.services.media_service as media_service_module
    import backend.api.services.knowledge_service as knowledge_service_module

    importlib.reload(settings_module)
    importlib.reload(session_module)
    importlib.reload(media_service_module)
    importlib.reload(knowledge_service_module)

    from backend.api.db.init_db import init_db

    init_db()
    yield db_file


@pytest.fixture
def seeded_db(temp_db, tmp_path):
    """
    Like temp_db but with the real campus map ingested. Used by API
    tests that need places and areas to exist.
    """
    from backend.api.settings import MAP_OSM_PATH
    from backend.pipeline.ingest import run_ingest

    if not Path(MAP_OSM_PATH).exists():
        pytest.skip(f"map.osm not found at {MAP_OSM_PATH}")

    run_ingest(osm_path=MAP_OSM_PATH, replace=True)
    yield temp_db


@pytest.fixture
def client(seeded_db, monkeypatch):
    """
    A FastAPI TestClient wired to the seeded database. Also resets
    the graph singleton so each test gets a freshly loaded graph,
    and sets a known admin key so admin endpoints can be tested.
    """
    monkeypatch.setenv("ADMIN_API_KEY", "test-admin-key")

    from fastapi.testclient import TestClient

    # Reload settings and dependencies so the new key is picked up.
    import importlib
    import backend.api.settings as settings_module
    import backend.api.dependencies as deps_module

    importlib.reload(settings_module)
    importlib.reload(deps_module)

    from backend.api.main import app
    from backend.api.services import graph_service

    graph_service.reset()
    with TestClient(app) as c:
        yield c