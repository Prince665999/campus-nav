"""
admin_user.py

Admin accounts. Phase 14 creates them with hashed passwords; Phase
17 adds the login flow that uses them.

Students never appear in this table. It's for admins only.
"""

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin


class AdminUser(Base, TimestampMixin):
    __tablename__ = "admin_user"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Email is stored hashed. This is enough to detect duplicates and
    # to look up by login, without keeping the address in plain text.
    email_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)

    # Password hash. Phase 14 uses a placeholder hash; Phase 17
    # replaces it with bcrypt or argon2 when real login lands.
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    role: Mapped[str] = mapped_column(String(32), nullable=False, default="contributor")

    def __repr__(self):
        return f"<AdminUser id={self.id} role={self.role!r}>"