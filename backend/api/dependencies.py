"""
dependencies.py

Shared FastAPI dependencies.
"""

from collections.abc import Generator

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from .db.session import get_session_factory
from .services.graph_service import get_graph
from .settings import ADMIN_API_KEY


def db_session() -> Generator[Session, None, None]:
    """
    Yield a SQLAlchemy session for the duration of one request.
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
    """The loaded routing graph."""
    return get_graph()


def require_admin(x_admin_key: str | None = Header(None)):
    """
    Guard every admin endpoint.

    Checks the X-Admin-Key header against ADMIN_API_KEY. This is an
    interim guard, not authentication — the admin site's server-side
    proxy sends the header on behalf of a browser that never sees it.
    Phase 17 replaces this with JWT-based login.
    """
    if not ADMIN_API_KEY:
        # If the key isn't configured, refuse everything. Safer than
        # leaving admin endpoints open by accident.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Admin access is not configured. Set ADMIN_API_KEY in "
                "the backend .env file."
            ),
        )

    if not x_admin_key or x_admin_key != ADMIN_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing admin key.",
        )