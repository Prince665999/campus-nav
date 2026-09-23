"""
auth_service.py

Password hashing and JWT issuing/verification for admin accounts.

Students never touch this. It's admin-only.
"""

import hashlib
import logging
from datetime import datetime, timedelta, timezone

from passlib.context import CryptContext
from sqlalchemy.orm import Session

from backend.api.models.admin_user import AdminUser
from backend.api.settings import JWT_ALGORITHM, JWT_EXPIRY_HOURS, JWT_SECRET

logger = logging.getLogger(__name__)


# Bcrypt is deliberately slow — a few hundred milliseconds per hash.
# That makes brute-forcing a stolen hash expensive without slowing
# down normal login much.
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    """Hash a plaintext password. Returns the hash string to store."""
    return _pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Check whether a plaintext password matches a stored hash."""
    try:
        return _pwd_context.verify(password, password_hash)
    except Exception:
        # Malformed hash — treat as no match.
        return False


# ---------------------------------------------------------------------------
# Email hashing
# ---------------------------------------------------------------------------

def hash_email(email: str) -> str:
    """
    Hash an email address for storage.

    Same approach as the device ID hashing in security.py — enough
    to look up by, not enough to reveal the address if the database
    leaks.
    """
    normalised = email.strip().lower()
    return hashlib.sha256(normalised.encode("utf-8")).hexdigest()[:32]


# ---------------------------------------------------------------------------
# JWT
# ---------------------------------------------------------------------------

def create_token(user: AdminUser) -> str:
    """
    Issue a JWT for a logged-in user. The token carries the user's id
    and role.
    """
    from jose import jwt

    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=JWT_EXPIRY_HOURS)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict | None:
    """
    Decode and verify a JWT. Returns the payload, or None if the
    token is invalid or expired.
    """
    from jose import JWTError, jwt

    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        return None


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

def authenticate(session: Session, email: str, password: str) -> AdminUser | None:
    """
    Look up a user by email and verify the password. Returns the user
    if both match, or None otherwise.

    Deliberately doesn't say which one failed — "wrong email" and
    "wrong password" are the same response, so an attacker can't
    enumerate accounts.
    """
    email_hash = hash_email(email)
    user = session.query(AdminUser).filter_by(email_hash=email_hash).one_or_none()
    if user is None:
        return None

    if not verify_password(password, user.password_hash):
        return None

    return user