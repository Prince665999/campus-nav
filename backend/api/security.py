"""
security.py

Helpers for the anonymous-device identity the app uses to key
favorites, recents, and reports without requiring student accounts.

The device generates a random ID on first launch and sends it with
each request that needs it. The backend hashes it before storing, so
the raw device ID never appears in the database. Two hashes of the
same ID match; you can't reverse the hash to get the ID back.

This is not authentication. It's just enough identity to make
"favorites survive between app launches" and "one device can't spam
reports" work without a login.
"""

import hashlib
import os

# A per-deployment salt. Set SESSION_SALT in production so hashes from
# two deployments don't collide. The default is fine for development.
_SALT = os.environ.get("SESSION_SALT", "campus-nav-dev-salt")


def hash_device_id(device_id: str) -> str:
    """
    Hash a device ID into a stable, non-reversible identifier.

    Returns a hex string. Same input always produces the same output
    for a given salt, so the app can use it as a key across sessions.
    """
    if not device_id:
        raise ValueError("device_id cannot be empty")
    payload = (_SALT + ":" + device_id).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()[:32]