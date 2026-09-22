"""
users.py

Admin endpoints for managing admin accounts.

Phase 14 creates accounts with passwords; Phase 17 adds the login
endpoint that uses them. Until then, this endpoint lets the owner
create contributors without anyone being able to log in as them yet.
"""

import hashlib
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...dependencies import db_session
from ...errors import BadRequestError, NotFoundError
from ...models.admin_user import AdminUser
from ...schemas.admin import AdminUserItem, CreateAdminUserRequest

router = APIRouter(prefix="/users", tags=["admin:users"])


def _hash_email(email: str) -> str:
    """Store emails hashed, not in plain text."""
    return hashlib.sha256(email.strip().lower().encode("utf-8")).hexdigest()[:32]


def _to_item(user: AdminUser) -> AdminUserItem:
    # The email column stores a hash. We can't reverse it, so we
    # return the hash truncated as a display id.
    return AdminUserItem(
        id=user.id,
        email=user.email_hash[:12] + "…",
        role=user.role,
        created_at=user.created_at,
    )


@router.get("", response_model=list[AdminUserItem])
def list_users(session: Session = Depends(db_session)):
    users = session.query(AdminUser).order_by(AdminUser.created_at).all()
    return [_to_item(u) for u in users]


@router.post("", response_model=AdminUserItem, status_code=201)
def create_user(
    body: CreateAdminUserRequest,
    session: Session = Depends(db_session),
):
    email_hash = _hash_email(body.email)

    existing = session.query(AdminUser).filter_by(email_hash=email_hash).one_or_none()
    if existing is not None:
        raise BadRequestError("A user with that email already exists.")

    password_hash = hashlib.sha256(body.password.encode("utf-8")).hexdigest()

    user = AdminUser(
        email_hash=email_hash,
        password_hash=password_hash,
        role=body.role,
    )
    session.add(user)
    session.flush()

    return _to_item(user)


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, session: Session = Depends(db_session)):
    user = session.query(AdminUser).filter_by(id=user_id).one_or_none()
    if user is None:
        raise NotFoundError(f"User {user_id} not found")
    session.delete(user)
    return None