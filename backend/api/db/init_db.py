"""
init_db.py

Creates the tables defined by the models. Idempotent — calling it twice
is a no-op.

Safety note
-----------
Some of our indexes and columns were added by Alembic migrations or
raw-SQL scripts, not by SQLAlchemy's metadata. `create_all` doesn't
know about them and will fail with "index already exists" on a
database that's already migrated.

To make this safe to run on any DB state, we create tables one at a
time so a failure on one table's index doesn't stop the rest.
"""

import logging

from sqlalchemy.exc import OperationalError

from .session import get_engine
from ..models import area, path_edge, place  # noqa: F401 (registers models)
from ..models.base import Base

logger = logging.getLogger(__name__)


def init_db():
    """Create every table that doesn't already exist."""
    engine = get_engine()
    for table in Base.metadata.sorted_tables:
        try:
            table.create(bind=engine, checkfirst=True)
        except OperationalError as e:
            msg = str(e).lower()
            if "already exists" in msg:
                # Expected on an already-migrated database. Log at
                # debug level — this is not a problem worth warning
                # about on every startup.
                logger.debug(
                    "init_db: skipped duplicate index on %s (%s)",
                    table.name,
                    e,
                )
                continue
            raise


def drop_all():
    """Drop every table. Used by tests only — never call this in prod."""
    Base.metadata.drop_all(bind=get_engine())


if __name__ == "__main__":
    init_db()
    print("Database tables created.")