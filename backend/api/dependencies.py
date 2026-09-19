"""
dependencies.py

Shared FastAPI dependencies. Currently: a database session per
request, and a graph loader that reads the routing graph once at
startup.
"""

from collections.abc import Generator

from fastapi import Depends
from sqlalchemy.orm import Session

from .db.session import get_session_factory
from .services.graph_service import get_graph


def db_session() -> Generator[Session, None, None]:
    """
    Yield a SQLAlchemy session for the duration of one request.

    Commits on clean exit, rolls back on exception, always closes.
    """
    SessionLocal = get_session_factory()
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def graph():
    """
    The loaded routing graph. Cached after the first call by
    graph_service.
    """
    return get_graph()