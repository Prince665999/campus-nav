"""
basemap.py

The outdoor base map, built from map.osm (see services/basemap_service.py).

  GET /api/basemap          the whole thing: layers of roads, paths, buildings...
  GET /api/basemap/version  just the version, so the phone can skip the download
                            when its saved copy is still current
"""

from fastapi import APIRouter
from fastapi.responses import JSONResponse, Response

from ..errors import NotFoundError
from ..services import basemap_service

router = APIRouter(prefix="/api/basemap", tags=["basemap"])


@router.get("")
def get_basemap():
    built = basemap_service.get_base_map()
    if built is None:
        raise NotFoundError("The map file (map.osm) was not found on the server")
    _version, payload = built
    return Response(content=payload, media_type="application/json")


@router.get("/version")
def get_basemap_version():
    built = basemap_service.get_base_map()
    if built is None:
        raise NotFoundError("The map file (map.osm) was not found on the server")
    version, _payload = built
    return JSONResponse({"version": version})
