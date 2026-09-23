"""
dependencies.py

Shared FastAPI dependencies.
"""

from collections.abc import Generator

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from .db.session import get_session_factory
from .services import auth_service
from .services.graph_service import get_graph
from .settings import ADMIN_API_KEY


def db_session() -> Generator[Session, None, None]:
    """Yield a SQLAlchemy session for the duration of one request."""
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


def require_admin(
    authorization: str | None = Header(None),
    x_admin_key: str | None = Header(None),
):
    """
    Guard every admin endpoint.

    Accepts either:
      - A Bearer token in the Authorization header (the real path).
      - The Phase 14 X-Admin-Key header (kept as a fallback so the
        admin site works before login is wired up, and so the CLI
        scripts from Phase 11 keep working).

    Once the admin site's login flow is in place, the X-Admin-Key
    fallback can be removed.
    """
    # Bearer token path.
    if authorization and authorization.startswith("Bearer "):
        token = authorization[len("Bearer ") :]
        payload = auth_service.decode_token(token)
        if payload is not None:
            return payload  # caller gets {sub, role, exp, ...}
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session. Please log in again.",
        )

    # Fallback: the Phase 14 shared secret.
    if ADMIN_API_KEY and x_admin_key and x_admin_key == ADMIN_API_KEY:
        return {"sub": "0", "role": "owner"}

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required.",
    )