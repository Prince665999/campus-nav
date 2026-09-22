"""
wifi.py

GET /api/wifi/nearby — Wi-Fi spots near a position.

The password is only returned when the request comes with a plausible
campus location. A request from the other side of the world gets the
SSID but not the password. This is a soft check, not real security —
anyone on campus can get the passwords, which is fine, because the
Wi-Fi is a campus network shared openly with students. The check just
prevents the passwords from being scraped from off-campus.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..dependencies import db_session
from ..schemas.wifi import WifiNearbyResponse
from ..services import wifi_service

router = APIRouter(prefix="/api/wifi", tags=["wifi"])

# The campus bounding box. Coordinates outside this box don't get
# passwords. Tune these to your actual campus location.
#
# These are set for the coordinates visible in the map data — the
# campus around Mbeya University of Science and Technology. If your
# map moves, update these.
CAMPUS_BOUNDS = {
    "min_lat": -8.9600,
    "max_lat": -8.9200,
    "min_lon": 33.4000,
    "max_lon": 33.4300,
}


def _is_on_campus(lat: float, lon: float) -> bool:
    """Whether the coordinates fall within the campus bounding box."""
    return (
        CAMPUS_BOUNDS["min_lat"] <= lat <= CAMPUS_BOUNDS["max_lat"]
        and CAMPUS_BOUNDS["min_lon"] <= lon <= CAMPUS_BOUNDS["max_lon"]
    )


@router.get("/nearby", response_model=WifiNearbyResponse)
def nearby(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    r: float = Query(30, gt=0, le=200, description="Radius in metres"),
    session: Session = Depends(db_session),
):
    """
    Wi-Fi spots within `r` metres of the given position.

    The password is only included when the query position is on
    campus. Off-campus callers get the SSID but not the password.
    """
    include_password = _is_on_campus(lat, lon)
    spots = wifi_service.nearby_wifi(
        session,
        lat=lat,
        lon=lon,
        radius_m=r,
        include_password=include_password,
    )
    return WifiNearbyResponse(spots=spots)