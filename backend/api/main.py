"""
main.py

The FastAPI application. Wires together every router, registers the
error handlers, and configures CORS for local mobile development.

Run with:
    uvicorn backend.api.main:app --reload
"""

import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .errors import (
    http_exception_handler,
    unhandled_exception_handler,
)
from .routers import areas, health, narrate, places, route

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
        version="0.4.0",
    )

    # ----- CORS -----
    # Permissive for local development. Phase 17 tightens this to the
    # production mobile app's origin.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ----- Error handlers -----
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)

    # ----- Routers -----
    app.include_router(health.router)
    app.include_router(places.router)
    app.include_router(areas.router)
    app.include_router(route.router)
    app.include_router(narrate.router)

    @app.get("/", tags=["root"])
    def root():
        """A tiny landing response so hitting / in a browser isn't a
        404."""
        return {
            "name": "Campus Navigation API",
            "version": "0.4.0",
            "docs": "/docs",
            "health": "/api/health",
        }

    return app


app = create_app()