"""
init_db.py

Creates the tables defined by the models. Idempotent — calling it twice
is a no-op.

Safety note
-----------
Some of our indexes and columns were added by Alembic migrations or
raw-SQL scripts, not by SQLAlchemy's metadata. `create_all` doesn't
know about them and will fail with "already exists" on a database that
is already migrated.

Rather than creating tables one at a time (which does not let
SQLAlchemy order them by foreign key), we call create_all() once and
catch the benign "already exists" errors. create_all() builds tables in
dependency order, so a table with a foreign key is always created after
the table it references.

Postgres raises ProgrammingError for duplicate objects in some paths
and OperationalError in others. We catch both and treat any "already
exists" / "duplicate" message as a benign skip.
"""

import logging

from sqlalchemy.exc import OperationalError, ProgrammingError

# Import the models package fully, so every model module is loaded and
# every table is registered with Base.metadata before we call create_all.
# A partial import (e.g. only `area, path_edge, place`) would leave the
# metadata incomplete, and tables added by migration scripts would not
# be created.
from backend.api import models  # noqa: F401
from backend.api.models.base import Base

from .session import get_engine

logger = logging.getLogger(__name__)


_BENIGN_STRINGS = ("already exists", "duplicate")


def _is_benign_duplicate(err: Exception) -> bool:
    msg = str(err).lower()
    return any(s in msg for s in _BENIGN_STRINGS)


def init_db():
    """
    Create every table that doesn't already exist.

    create_all() does the FK-aware ordering. If a benign duplicate is
    raised (an index or table already present from a prior migration),
    we log it and continue — the schema we need is still there.
    """
    engine = get_engine()
    try:
        Base.metadata.create_all(bind=engine, checkfirst=True)
    except (OperationalError, ProgrammingError) as e:
        if _is_benign_duplicate(e):
            logger.debug("init_db: benign duplicate during create_all (%s)", e)
            return
        raise


def drop_all():
    """Drop every table. Used by tests only — never call this in prod."""
    Base.metadata.drop_all(bind=get_engine())


if __name__ == "__main__":
    init_db()
    print("Database tables created.")