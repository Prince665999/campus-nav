"""
create_admin_user.py

Create an admin account from the command line. Used to bootstrap the
first login before the admin site's Roles page can be reached.

Usage:
    python admin/scripts/create_admin_user.py --email you@example.com --password <secret>
    python admin/scripts/create_admin_user.py --email you@example.com --password <secret> --role contributor
"""

import argparse
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from _common import error, heading, info, session


def main():
    parser = argparse.ArgumentParser(description="Create an admin user.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument(
        "--role",
        default="owner",
        choices=["owner", "contributor"],
    )
    args = parser.parse_args()

    from backend.api.db.init_db import init_db
    from backend.api.models.admin_user import AdminUser
    from backend.api.services import auth_service

    init_db()

    with session() as s:
        email_hash = auth_service.hash_email(args.email)
        existing = (
            s.query(AdminUser).filter_by(email_hash=email_hash).one_or_none()
        )
        if existing is not None:
            error("A user with that email already exists.")
            sys.exit(1)

        user = AdminUser(
            email_hash=email_hash,
            password_hash=auth_service.hash_password(args.password),
            role=args.role,
        )
        s.add(user)
        s.flush()
        heading("Admin user created")
        info(f"id: {user.id}")
        info(f"role: {user.role}")


if __name__ == "__main__":
    main()