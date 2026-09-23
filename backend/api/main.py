"""
main.py

The FastAPI application.
"""

import logging
import time
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded

from .db.init_db import init_db
from .dependencies import require_admin
from .errors import http_exception_handler, unhandled_exception_handler
from .logging_config import get_request_logger, setup_logging
from .rate_limit import limiter, rate_limit_exceeded_handler
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
    wifi,
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
from .settings import IS_DEV, MEDIA_DIR, SENTRY_DSN

logger = logging.getLogger(__name__)
request_logger = get_request_logger()


@asynccontextmanager
async def lifespan(app):
    """Startup and shutdown hooks."""
    setup_logging()
    logger.info("API starting", extra={"environment": "dev" if IS_DEV else "prod"})

    # Optional error tracking. If SENTRY_DSN isn't set, nothing is
    # sent anywhere.
    if SENTRY_DSN:
        try:
            import sentry_sdk
            from sentry_sdk.integrations.fastapi import FastApiIntegration

            sentry_sdk.init(
                dsn=SENTRY_DSN,
                integrations=[FastApiIntegration()],
                traces_sample_rate=0.1,
                environment="dev" if IS_DEV else "prod",
            )
            logger.info("Sentry initialized")
        except ImportError:
            logger.warning("SENTRY_DSN set but sentry_sdk not installed")

    init_db()
    logger.info("Schema ready")
    yield
    logger.info("API shutting down")


def create_app() -> FastAPI:
    app = FastAPI(
        title="Campus Navigation API",
        description=(
            "Backend for the Campus Navigation mobile app and the "
            "admin website."
        ),
        version="0.17.0",
        lifespan=lifespan,
    )

    # Rate limiter state lives on the app.
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Request logging middleware.
    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        start = time.time()
        response = await call_next(request)
        duration_ms = round((time.time() - start) * 1000, 1)
        request_logger.info(
            "%s %s %d",
            request.method,
            request.url.path,
            response.status_code,
            extra={
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": duration_ms,
            },
        )
        return response

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
    app.include_router(wifi.router)

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
            "version": "0.17.0",
            "docs": "/docs",
            "health": "/api/health",
        }

    return app


app = create_app()