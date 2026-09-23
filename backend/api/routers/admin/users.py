"""
users.py

Admin endpoints for managing admin accounts.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...dependencies import db_session
from ...errors import BadRequestError, NotFoundError
from ...models.admin_user import AdminUser
from ...schemas.admin import (
    AdminUserItem,
    CreateAdminUserRequest,
    UpdateAdminUserRequest,
)
from ...services import auth_service

router = APIRouter(prefix="/users", tags=["admin:users"])


def _to_item(user: AdminUser) -> AdminUserItem:
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
    email_hash = auth_service.hash_email(body.email)

    existing = session.query(AdminUser).filter_by(email_hash=email_hash).one_or_none()
    if existing is not None:
        raise BadRequestError("A user with that email already exists.")

    password_hash = auth_service.hash_password(body.password)

    user = AdminUser(
        email_hash=email_hash,
        password_hash=password_hash,
        role=body.role,
    )
    session.add(user)
    session.flush()

    return _to_item(user)


@router.patch("/{user_id}", response_model=AdminUserItem)
def update_user(
    user_id: int,
    body: UpdateAdminUserRequest,
    session: Session = Depends(db_session),
):
    """
    Change a user's role or password.
    """
    user = session.query(AdminUser).filter_by(id=user_id).one_or_none()
    if user is None:
        raise NotFoundError(f"User {user_id} not found")

    if body.role is not None:
        user.role = body.role
    if body.password is not None:
        user.password_hash = auth_service.hash_password(body.password)

    session.flush()
    return _to_item(user)


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, session: Session = Depends(db_session)):
    user = session.query(AdminUser).filter_by(id=user_id).one_or_none()
    if user is None:
        raise NotFoundError(f"User {user_id} not found")
    session.delete(user)
    return None