"""
errors.py

Consistent error responses and exception handlers.

Every error the API returns has the same JSON shape:
    {"detail": "...", "code": "..."}

That makes the mobile app's error handling one function instead of
one per endpoint.
"""

from fastapi import HTTPException, Request, status
from fastapi.responses import JSONResponse


class NotFoundError(HTTPException):
    def __init__(self, detail: str):
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


class BadRequestError(HTTPException):
    def __init__(self, detail: str):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


class RouteNotFoundError(HTTPException):
    """Used when A* returns no path between two points."""

    def __init__(self, detail: str = "No route found between those points"):
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


async def http_exception_handler(request: Request, exc: HTTPException):
    """Wrap FastAPI's HTTPException in our consistent shape."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "code": exc.__class__.__name__},
    )


async def unhandled_exception_handler(request: Request, exc: Exception):
    """Catch anything that isn't already an HTTPException."""
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "code": "InternalError"},
    )