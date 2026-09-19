"""
settings.py

Env-driven configuration. Every value the backend needs at runtime
comes from here, and every value has a sensible default for local
development. Nothing in this file reads from a hardcoded path.

Reads from environment variables; never raises when they're missing.
"""

import os
from pathlib import Path


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

# backend/ — the folder that contains this file's parent's parent.
BACKEND_DIR = Path(__file__).resolve().parent.parent

# backend/data/ — where map.osm and the SQLite database live.
DATA_DIR = BACKEND_DIR / "data"

# The OSM extract that the pipeline reads.
MAP_OSM_PATH = Path(os.environ.get("MAP_OSM_PATH", DATA_DIR / "map.osm"))

# The SQLite database the pipeline writes and the API reads.
DATABASE_PATH = Path(os.environ.get("DATABASE_PATH", DATA_DIR / "campus.db"))

# Where graph snapshots are written (used from Phase 13 onward).
SNAPSHOTS_DIR = DATA_DIR / "snapshots"


# ---------------------------------------------------------------------------
# Database URL
# ---------------------------------------------------------------------------

# SQLAlchemy connection string. Defaults to the SQLite file above.
# Phase 13 changes this to a Postgres URL via the environment.
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "sqlite:///" + str(DATABASE_PATH).replace("\\", "/"),
)


# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------

ENVIRONMENT = os.environ.get("ENVIRONMENT", "dev")
IS_DEV = ENVIRONMENT == "dev"


# ---------------------------------------------------------------------------
# Ingest behaviour
# ---------------------------------------------------------------------------

# If True, ingest.py wipes the places/areas/path_edges tables before
# writing. If False, it upserts by osm_id. For the first run this
# doesn't matter; from the second run onward you want False so manual
# edits survive.
INGEST_REPLACE = os.environ.get("INGEST_REPLACE", "false").lower() == "true"