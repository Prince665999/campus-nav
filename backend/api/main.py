"""
main.py

The FastAPI application.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .db.init_db import init_db
from .dependencies import require_admin
from .errors import http_exception_handler, unhandled_exception_handler
from .routers import (
    areas,
    chat,
    favorites,
    health,
    media,
    narrate,
    places,
    reports,
    route,
)
from .routers.admin import (
    map_health as admin_map_health,
    media as admin_media,
    places as admin_places,
    reimport as admin_reimport,
    reports as admin_reports,
    stats as admin_stats,
    users as admin_users,
)
from .settings import MEDIA_DIR

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app):
    """Startup and shutdown hooks."""
    init_db()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="Campus Navigation API",
        description=(
            "Backend for the Campus Navigation mobile app and the "
            "admin website."
        ),
        version="0.15.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)

    # Public routers
    app.include_router(health.router)
    app.include_router(places.router)
    app.include_router(areas.router)
    app.include_router(route.router)
    app.include_router(narrate.router)
    app.include_router(media.router)
    app.include_router(favorites.router)
    app.include_router(reports.router)
    app.include_router(chat.router)

    # Admin routers
    admin_prefix = "/api/admin"
    admin_deps = [Depends(require_admin)]

    app.include_router(
        admin_stats.router, prefix=admin_prefix, dependencies=admin_deps
    )
    app.include_router(
        admin_places.router, prefix=admin_prefix, dependencies=admin_deps
    )
    app.include_router(
        admin_media.router, prefix=admin_prefix, dependencies=admin_deps
    )
    app.include_router(
        admin_reports.router, prefix=admin_prefix, dependencies=admin_deps
    )
    app.include_router(
        admin_map_health.router, prefix=admin_prefix, dependencies=admin_deps
    )
    app.include_router(
        admin_reimport.router, prefix=admin_prefix, dependencies=admin_deps
    )
    app.include_router(
        admin_users.router, prefix=admin_prefix, dependencies=admin_deps
    )

    app.mount(
        "/media",
        StaticFiles(directory=str(MEDIA_DIR)),
        name="media",
    )

    @app.get("/", tags=["core"])
    def root():
        return {
            "name": "Campus Navigation API",
            "version": "0.15.0",
            "docs": "/docs",
            "health": "/api/health",
        }

    return app


app = create_app()