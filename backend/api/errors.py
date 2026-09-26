"""
errors.py

Consistent error responses and exception handlers.
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
    def __init__(self, detail: str = "No route found between those points"):
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


class LocationTooFarError(HTTPException):
    """
    Used when a live GPS fix can't be confidently matched to a node on
    the path network. This is a distinct error from RouteNotFoundError
    because the cause is different: the fix is unreliable, not that no
    path exists.
    """

    def __init__(
        self,
        detail: str = (
            "Couldn't confidently place your location on the map. "
            "Move to an open area and try again."
        ),
    ):
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=detail,
        )


async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "code": exc.__class__.__name__},
    )


async def unhandled_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "code": "InternalError"},
    )