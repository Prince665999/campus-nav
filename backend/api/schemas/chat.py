"""
chat.py

Request and response shapes for the route chat endpoints.
"""

from pydantic import BaseModel, Field


class ExtractDestinationRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=500)


class ExtractDestinationResponse(BaseModel):
    place_id: int | None = None
    confidence: str = "medium"
    matched: bool = False


class ChatRequest(BaseModel):
    """Body for POST /api/chat — the route chat.

    The starting point is either a place (from_place_id, set when the
    walk began from the starting-point picker) or the walk's original
    live coordinates (from_lat/from_lon, the normal GPS-started case).
    At least one of the two is needed to rebuild the route.

    All route fields are optional at the schema level so the endpoint
    doesn't 422 if the client can't supply them. When they're missing
    the endpoint answers with a reduced reply rather than failing.
    """

    message: str = Field(..., min_length=1, max_length=1000)
    session_id: str | None = None

    # The route's starting point. Place ID when the walk began from
    # the picker; coordinates when it began from live GPS.
    from_place_id: int | None = None
    from_lat: float | None = Field(None, ge=-90, le=90)
    from_lon: float | None = Field(None, ge=-180, le=180)

    # The destination. Always known — a walk always has one.
    to_place_id: int | None = None

    # Where the student is on the route right now. Used to place the
    # question on the timeline.
    current_step_index: int = 0
    distance_from_start_m: float = 0.0

    # The student's live position, used to include nearby places in
    # the prompt. Optional.
    current_lat: float | None = Field(None, ge=-90, le=90)
    current_lon: float | None = Field(None, ge=-180, le=180)


class ChatResponse(BaseModel):
    reply: str
    session_id: str | None = None


class StartChatSessionResponse(BaseModel):
    session_id: str