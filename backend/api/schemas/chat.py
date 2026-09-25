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

    All route fields are required: this endpoint only makes sense
    during a walk. If there's no walk, use POST /api/chat/doc.
    """

    message: str = Field(..., min_length=1, max_length=1000)
    session_id: str | None = None

    from_place_id: int
    to_place_id: int
    current_step_index: int
    distance_from_start_m: float

    # The student's position, used to include nearby places in the
    # prompt. Optional.
    current_lat: float | None = Field(None, ge=-90, le=90)
    current_lon: float | None = Field(None, ge=-180, le=180)


class ChatResponse(BaseModel):
    reply: str
    session_id: str | None = None


class StartChatSessionResponse(BaseModel):
    session_id: str