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
# Knowledge base
# ---------------------------------------------------------------------------

# Where ChromaDB stores its data. A folder on disk, not a server.
CHROMA_DIR = Path(os.environ.get("CHROMA_DIR", DATA_DIR / "chroma"))
CHROMA_DIR.mkdir(parents=True, exist_ok=True)

# The collection name in Chroma. All knowledge chunks live here.
CHROMA_COLLECTION = os.environ.get("CHROMA_COLLECTION", "campus_knowledge")

# The embedding model. all-MiniLM-L6-v2 is 80 MB, runs on CPU, and
# produces 384-dimension vectors. Good enough for a campus knowledge
# base and free.
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "all-MiniLM-L6-v2")

# Where uploaded knowledge documents live before processing.
KNOWLEDGE_UPLOAD_DIR = Path(
    os.environ.get("KNOWLEDGE_UPLOAD_DIR", DATA_DIR / "knowledge")
)
KNOWLEDGE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Maximum size of an uploaded document, in bytes. 25 MB.
KNOWLEDGE_MAX_UPLOAD_BYTES = int(
    os.environ.get("KNOWLEDGE_MAX_UPLOAD_BYTES", 25 * 1024 * 1024)
)

# Chunk size in words (not tokens — a simple approximation).
KNOWLEDGE_CHUNK_WORDS = int(os.environ.get("KNOWLEDGE_CHUNK_WORDS", 300))

# How many chunks to retrieve per query.
KNOWLEDGE_TOP_K = int(os.environ.get("KNOWLEDGE_TOP_K", 5))


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
# Auth
# ---------------------------------------------------------------------------

JWT_SECRET = os.environ.get(
    "JWT_SECRET",
    "dev-secret-do-not-use-in-production-change-me",
)
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = int(os.environ.get("JWT_EXPIRY_HOURS", 8))


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------

RATE_LIMIT_ENABLED = os.environ.get(
    "RATE_LIMIT_ENABLED",
    "true" if IS_PROD else "false",
).lower() == "true"

RATE_LIMIT_NARRATE = os.environ.get("RATE_LIMIT_NARRATE", "30/minute")
RATE_LIMIT_REPORTS = os.environ.get("RATE_LIMIT_REPORTS", "10/minute")
RATE_LIMIT_CHAT = os.environ.get("RATE_LIMIT_CHAT", "30/minute")


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

LOG_FORMAT = os.environ.get("LOG_FORMAT", "console" if IS_DEV else "json")
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")


# ---------------------------------------------------------------------------
# Error tracking
# ---------------------------------------------------------------------------

SENTRY_DSN = os.environ.get("SENTRY_DSN", "")