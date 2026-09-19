"""
narration.py

Request and response shapes for /api/narrate.
"""

from pydantic import BaseModel


class NarrationRequest(BaseModel):
    """Query params for /api/narrate."""

    from_place_id: int
    to_place_id: int
    profile: str = "fastest"
    lang: str = "en"
    live: bool = False  # if True, call Groq; if False, use local narration


class NarrationResponse(BaseModel):
    """The shape returned by /api/narrate."""

    text: str
    source: str  # "local" or "groq"
    lang: str
    style: str = "guide"