"""
wifi.py

Request and response shapes for the Wi-Fi endpoints.
"""

from pydantic import BaseModel

from .common import LatLon


class WifiSpot(BaseModel):
    """One Wi-Fi location near the student."""

    place_id: int
    name: str
    location: LatLon
    distance_m: float

    # Network name. If absent, we don't know the SSID and the banner
    # should say "Wi-Fi available here" without naming it.
    ssid: str | None = None

    # Password. Included only when the client explicitly asks for it,
    # so a casual call to this endpoint doesn't leak passwords.
    password: str | None = None

    # Whether a password is known. Useful so the banner can offer
    # "Connect" even if the password is missing (some networks are open).
    has_password: bool = False


class WifiNearbyResponse(BaseModel):
    """Returned by GET /api/wifi/nearby."""

    spots: list[WifiSpot]