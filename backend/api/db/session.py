"""
session.py

SQLAlchemy engine and session factory. One engine per process, one
session per unit of work.

The engine is created lazily on first use, so importing this module
doesn't try to open the database file.
"""

from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from backend.api.settings import DATABASE_URL


_engine = None
_SessionLocal = None


def get_engine():
    """Return the process-wide engine, creating it on first call."""
    global _engine
    if _engine is None:
        _engine = create_engine(
            DATABASE_URL,
            echo=False,
            future=True,
            # SQLite-specific: allow use from multiple threads (the API
            # serves requests on a threadpool). No effect on Postgres.
            connect_args={"check_same_thread": False}
            if DATABASE_URL.startswith("sqlite")
            else {},
        )
    return _engine


def get_session_factory():
    """Return a configured sessionmaker bound to the engine."""
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(
            bind=get_engine(),
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
            future=True,
        )
    return _SessionLocal


@contextmanager
def session_scope():
    """
    Context manager for a unit of work.

    Usage:
        with session_scope() as session:
            session.add(obj)
        # commits on exit, rolls back on exception, closes always
    """
    SessionLocal = get_session_factory()
    session: Session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()