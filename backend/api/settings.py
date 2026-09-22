"""
settings.py

Env-driven configuration.
"""

import os
from pathlib import Path


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"

MAP_OSM_PATH = Path(os.environ.get("MAP_OSM_PATH", DATA_DIR / "map.osm"))
DATABASE_PATH = Path(os.environ.get("DATABASE_PATH", DATA_DIR / "campus.db"))
SNAPSHOTS_DIR = DATA_DIR / "snapshots"

MEDIA_DIR = Path(os.environ.get("MEDIA_DIR", DATA_DIR / "media"))
MEDIA_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Database URL
# ---------------------------------------------------------------------------

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

INGEST_REPLACE = os.environ.get("INGEST_REPLACE", "false").lower() == "true"


# ---------------------------------------------------------------------------
# Media
# ---------------------------------------------------------------------------

MEDIA_BASE_URL = os.environ.get("MEDIA_BASE_URL", "http://192.168.100.148:8000")
MEDIA_MAX_UPLOAD_BYTES = int(os.environ.get("MEDIA_MAX_UPLOAD_BYTES", 10 * 1024 * 1024))

MEDIA_VARIANTS = [
    ("thumb", 200),
    ("card", 800),
    ("full", 1600),
]


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

# Redis URL. Defaults to a local Redis on the standard port. If Redis
# isn't running, the cache falls through gracefully — the app still
# works, just without caching.
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

# How long a cached route stays warm. 24 hours means a route computed
# today is still cached tomorrow morning, which covers the "same
# routes every day" pattern of campus walking.
ROUTE_CACHE_TTL_S = int(os.environ.get("ROUTE_CACHE_TTL_S", 24 * 60 * 60))

# Same for narration. Narration changes rarely, so a long TTL is fine.
NARRATION_CACHE_TTL_S = int(os.environ.get("NARRATION_CACHE_TTL_S", 24 * 60 * 60))

# Set CACHE_ENABLED=false to disable all caching. Useful in tests
# and for debugging a suspected cache issue.
CACHE_ENABLED = os.environ.get("CACHE_ENABLED", "true").lower() == "true"