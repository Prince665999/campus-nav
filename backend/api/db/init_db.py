"""
init_db.py

Creates the tables defined by the models. Idempotent — calling it twice
is a no-op.
"""

from .session import get_engine
from ..models import area, path_edge, place  # noqa: F401 (registers models)
from ..models.base import Base


def init_db():
    """Create every table that doesn't already exist."""
    Base.metadata.create_all(bind=get_engine())


def drop_all():
    """Drop every table. Used by tests only — never call this in prod."""
    Base.metadata.drop_all(bind=get_engine())


if __name__ == "__main__":
    init_db()
    print("Database tables created.")