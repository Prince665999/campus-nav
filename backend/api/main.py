"""
main.py

The FastAPI application.
"""

import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .errors import (
    http_exception_handler,
    unhandled_exception_handler,
)
from .routers import (
    areas,
    favorites,
    health,
    media,
    narrate,
    places,
    reports,
    route,
)
from .settings import MEDIA_DIR

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    app = FastAPI(
        title="Campus Navigation API",
        description=(
            "Backend for the Campus Navigation mobile app. Wraps the "
            "existing A* routing engine and narration pipeline."
        ),
        version="0.10.0",
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

    app.include_router(health.router)
    app.include_router(places.router)
    app.include_router(areas.router)
    app.include_router(route.router)
    app.include_router(narrate.router)
    app.include_router(media.router)
    app.include_router(favorites.router)
    app.include_router(reports.router)

    app.mount(
        "/media",
        StaticFiles(directory=str(MEDIA_DIR)),
        name="media",
    )

    @app.get("/", tags=["core"])
    def root():
        return {
            "name": "Campus Navigation API",
            "version": "0.10.0",
            "docs": "/docs",
            "health": "/api/health",
        }

    return app


app = create_app()