"""
wifi_service.py

Find the Wi-Fi spots near a given position.

Wi-Fi spots are places with `has_wifi = True`. The `wifi_ssid` and
`wifi_password` columns are populated during ingest from the
`wifi:ssid` and `wifi:password` OSM tags, or edited by hand in the
admin.

The password is only returned when the caller explicitly requests
it — see the router for why.
"""

from sqlalchemy.orm import Session

from backend.core.campus_graph import haversine_m

from ..models.place import Place
from ..schemas.common import LatLon
from ..schemas.wifi import WifiSpot


def nearby_wifi(
    session: Session,
    lat: float,
    lon: float,
    radius_m: float = 30,
    include_password: bool = False,
    limit: int = 10,
) -> list[WifiSpot]:
    """
    Wi-Fi spots within `radius_m` of the given position.

    radius_m defaults to 30 — a Wi-Fi access point is typically usable
    only within a small radius, so a tighter default than the general
    places proximity search (which uses 500m).
    """
    rows = (
        session.query(Place)
        .filter(Place.has_wifi.is_(True))
        .all()
    )

    out = []
    for place in rows:
        d = haversine_m(lat, lon, place.lat, place.lon)
        if d > radius_m:
            continue

        out.append(
            WifiSpot(
                place_id=place.id,
                name=place.name,
                location=LatLon(lat=place.lat, lon=place.lon),
                distance_m=d,
                ssid=place.wifi_ssid,
                password=place.wifi_password if include_password else None,
                has_password=bool(place.wifi_password),
            )
        )

    out.sort(key=lambda s: s.distance_m)
    return out[:limit]