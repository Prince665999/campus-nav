"""
settings.py

Env-driven configuration.
"""

import os
from pathlib import Path

# Load .env from the backend folder if it exists. This makes the
# env vars in that file available to os.environ, so the rest of this
# module reads them naturally.
from dotenv import load_dotenv

_BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(_BACKEND_DIR / ".env")

DATA_DIR = _BACKEND_DIR / "data"

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

MEDIA_BASE_URL = os.environ.get("MEDIA_BASE_URL", "http://localhost:8000")
MEDIA_MAX_UPLOAD_BYTES = int(os.environ.get("MEDIA_MAX_UPLOAD_BYTES", 10 * 1024 * 1024))

MEDIA_VARIANTS = [
    ("thumb", 200),
    ("card", 800),
    ("full", 1600),
]


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
ROUTE_CACHE_TTL_S = int(os.environ.get("ROUTE_CACHE_TTL_S", 24 * 60 * 60))
NARRATION_CACHE_TTL_S = int(os.environ.get("NARRATION_CACHE_TTL_S", 24 * 60 * 60))
CACHE_ENABLED = os.environ.get("CACHE_ENABLED", "true").lower() == "true"


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------

# Shared secret that the admin site sends in the X-Admin-Key header.
# Interim guard only — Phase 17 replaces it with real JWT login.
#
# If unset, admin endpoints return 503 rather than allowing open
# access. Safer default than an empty key that matches everything.
ADMIN_API_KEY = os.environ.get("ADMIN_API_KEY", "")