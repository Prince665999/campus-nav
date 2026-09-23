"""
auth.py

Login, logout, and session-check endpoints.

  POST /api/admin/auth/login
  POST /api/admin/auth/logout
  GET  /api/admin/auth/me
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from ...dependencies import db_session
from ...errors import BadRequestError
from ...models.admin_user import AdminUser
from ...schemas.admin import LoginRequest, LoginResponse, WhoAmIResponse
from ...services import auth_service
from ...settings import JWT_EXPIRY_HOURS

router = APIRouter(prefix="/auth", tags=["admin:auth"])


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, session: Session = Depends(db_session)):
    """
    Log in with email and password. Returns a JWT that must be sent
    on every subsequent admin request as `Authorization: Bearer <token>`.
    """
    user = auth_service.authenticate(session, body.email, body.password)
    if user is None:
        raise BadRequestError("Invalid email or password.")

    token = auth_service.create_token(user)
    return LoginResponse(
        token=token,
        role=user.role,
        expires_in_s=JWT_EXPIRY_HOURS * 3600,
    )


@router.post("/logout", status_code=204)
def logout():
    """
    Logout is a client-side action — the token is discarded by the
    browser. This endpoint exists so the client has something to call
    and so a future "revoke this token" feature has a home.
    """
    return None


@router.get("/me", response_model=WhoAmIResponse)
def whoami(
    authorization: str | None = Header(None),
    session: Session = Depends(db_session),
):
    """
    Return the current user. Used by the admin site to check whether
    the stored token is still valid on page load.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise BadRequestError("Missing or malformed Authorization header.")

    token = authorization[len("Bearer ") :]
    payload = auth_service.decode_token(token)
    if payload is None:
        raise BadRequestError("Invalid or expired token.")

    user_id = int(payload["sub"])
    user = session.query(AdminUser).filter_by(id=user_id).one_or_none()
    if user is None:
        raise BadRequestError("User no longer exists.")

    return WhoAmIResponse(
        user_id=user.id,
        role=user.role,
        email=user.email_hash[:12] + "…",
    )