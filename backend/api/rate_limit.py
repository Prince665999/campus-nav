"""
rate_limit.py

Rate limiting via slowapi.

The limiter is created here and attached to the app in main.py. The
per-endpoint limits are declared in the routers with a decorator.

In development the limits are no-ops — see settings.py for why.
"""

import logging

from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.requests import Request
from starlette.responses import JSONResponse

from backend.api.settings import RATE_LIMIT_ENABLED

logger = logging.getLogger(__name__)


# The limiter. Key function is the client IP — for a campus app on a
# shared network this can group several students under one NAT, but
# it's the standard approach and the limits are generous enough that
# normal use never trips them.
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[],
    enabled=RATE_LIMIT_ENABLED,
    storage_uri="memory://",
)


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    """
    Return a clean 429 response instead of slowapi's default.
    """
    logger.warning(
        "Rate limit exceeded: %s %s from %s",
        request.method,
        request.url.path,
        get_remote_address(request),
    )
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Too many requests. Please slow down.",
            "code": "RateLimitExceeded",
        },
    )