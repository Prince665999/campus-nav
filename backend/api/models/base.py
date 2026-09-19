"""
base.py

The SQLAlchemy declarative base every model inherits from. Also
provides a `TimestampMixin` that gives every table created_at and
updated_at columns maintained automatically.
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Shared base for every ORM model."""
    pass


def _utcnow():
    """Timezone-aware UTC now. Used as a Python-side default so tests
    don't depend on SQLite's clock."""
    return datetime.now(timezone.utc)


class TimestampMixin:
    """
    Adds created_at and updated_at to a model. Both are timezone-aware.

    created_at is set once on insert.
    updated_at is refreshed on every update by SQLAlchemy.
    """

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utcnow,
        server_default=func.current_timestamp(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utcnow,
        onupdate=_utcnow,
        server_default=func.current_timestamp(),
        nullable=False,
    )