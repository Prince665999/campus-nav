"""
settings.py

Env-driven configuration.
"""

import os
from pathlib import Path

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
IS_PROD = ENVIRONMENT == "prod"


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

ADMIN_API_KEY = os.environ.get("ADMIN_API_KEY", "")


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------

# Rate limits are enforced only in production. In development every
# endpoint is unlimited, so a screen that fires three requests on
# mount doesn't trip a limit you'd then have to debug.
#
# In production the limits apply. Format is "N/period", where period
# is one of second, minute, hour.
RATE_LIMIT_ENABLED = os.environ.get(
    "RATE_LIMIT_ENABLED",
    "true" if IS_PROD else "false",
).lower() == "true"

# The limits, per IP address.
RATE_LIMIT_NARRATE = os.environ.get("RATE_LIMIT_NARRATE", "30/minute")
RATE_LIMIT_REPORTS = os.environ.get("RATE_LIMIT_REPORTS", "10/minute")
RATE_LIMIT_CHAT = os.environ.get("RATE_LIMIT_CHAT", "30/minute")


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

# "json" for structured logs (production), "console" for readable
# logs (development).
LOG_FORMAT = os.environ.get("LOG_FORMAT", "console" if IS_DEV else "json")
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")


# ---------------------------------------------------------------------------
# Error tracking
# ---------------------------------------------------------------------------

# Sentry DSN. If empty, Sentry is disabled — no data sent anywhere.
SENTRY_DSN = os.environ.get("SENTRY_DSN", "")