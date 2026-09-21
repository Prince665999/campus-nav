"""
main.py

The FastAPI application. Wires together every router, registers the
error handlers, mounts the media static files, and configures CORS
for local mobile development.
"""

import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .errors import (
    http_exception_handler,
    unhandled_exception_handler,
)
from .routers import areas, health, media, narrate, places, route
from .settings import MEDIA_DIR

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    """Build the FastAPI app. Separate from module-level creation so
    tests can construct a fresh app if needed."""
    app = FastAPI(
        title="Campus Navigation API",
        description=(
            "Backend for the Campus Navigation mobile app. Wraps the "
            "existing A* routing engine and narration pipeline."
        ),
        version="0.8.0",
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

    # Serve uploaded photos as static files at /media/<path>.
    # The media_service writes them here; the response URLs point
    # at this mount point.
    app.mount(
        "/media",
        StaticFiles(directory=str(MEDIA_DIR)),
        name="media",
    )

    @app.get("/", tags=["root"])
    def root():
        return {
            "name": "Campus Navigation API",
            "version": "0.8.0",
            "docs": "/docs",
            "health": "/api/health",
        }

    return app


app = create_app()