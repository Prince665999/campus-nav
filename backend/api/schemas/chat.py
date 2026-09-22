"""
chat.py

Request and response shapes for the chat endpoints.
"""

from pydantic import BaseModel, Field


class ExtractDestinationRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=500)


class ExtractDestinationResponse(BaseModel):
    place_id: int | None = None
    confidence: str = "medium"  # high / medium / low
    matched: bool = False


class ChatMessage(BaseModel):
    """One turn of a conversation."""

    role: str = Field(..., pattern="^(user|assistant)$")
    content: str


class ChatRequest(BaseModel):
    """Body for POST /api/chat.

    The client sends the message plus the current route context.
    When the student's current position is included, the server can
    also include places near them in the answer.
    """

    message: str = Field(..., min_length=1, max_length=1000)
    session_id: str | None = None

    # Route context. If present, the assistant can answer questions
    # about the walk.
    from_place_id: int | None = None
    to_place_id: int | None = None
    current_step_index: int | None = None
    distance_from_start_m: float | None = None

    # Current position. Used to look up nearby places. Optional —
    # without it, the assistant answers only from the route timeline.
    current_lat: float | None = Field(None, ge=-90, le=90)
    current_lon: float | None = Field(None, ge=-180, le=180)


class ChatResponse(BaseModel):
    reply: str
    session_id: str | None = None


class StartChatSessionResponse(BaseModel):
    session_id: str