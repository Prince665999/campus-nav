"""
conftest.py for backend-level tests (pipeline and API).

Puts the repo root on sys.path so `import backend.api...` works, and
provides a fresh in-memory SQLite database per test.
"""

import sys
from pathlib import Path

import pytest

# Repo root: the folder containing backend/
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


@pytest.fixture
def temp_db(tmp_path, monkeypatch):
    """
    Point DATABASE_URL at a fresh SQLite file for the duration of one
    test, so every test gets its own empty schema.
    """
    db_file = tmp_path / "test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_file}")

    # Force the settings and session modules to be re-imported so they
    # pick up the new URL.
    import importlib
    import backend.api.settings as settings_module
    import backend.api.db.session as session_module
    importlib.reload(settings_module)
    importlib.reload(session_module)

    from backend.api.db.init_db import init_db
    init_db()
    yield db_file