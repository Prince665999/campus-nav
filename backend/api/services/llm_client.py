"""
llm_client.py

Thin wrapper around Groq's chat completions API, used by the chat
service.

The narration pipeline has its own Groq call inside the frozen
ai_navigator.py. That one can't be touched. This is a separate client
for the chat features, with the same shape but its own configuration.

If GROQ_API_KEY isn't set, every function returns None instead of
raising. Callers check for None and fall back to a non-LLM path.
"""

import json
import logging
import os

logger = logging.getLogger(__name__)

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "openai/gpt-oss-120b"

# How long to wait for a response before giving up. Chat should feel
# responsive; if Groq is slow, better to fall back than to hang.
REQUEST_TIMEOUT_S = 20


def is_available() -> bool:
    """Whether an LLM can be called at all."""
    return bool(os.environ.get("GROQ_API_KEY"))


def chat(messages, temperature=0.4, max_tokens=600):
    """
    Send a conversation to Groq. Returns the assistant's text, or None
    if the API key isn't set or the call fails.

    `messages` is a list of {"role": "...", "content": "..."} dicts,
    same shape as OpenAI's API.
    """
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        return None

    try:
        import requests
    except ImportError:
        logger.warning("requests is not installed; chat is unavailable")
        return None

    try:
        response = requests.post(
            GROQ_URL,
            headers={
                "Authorization": "Bearer " + api_key,
                "Content-Type": "application/json",
            },
            data=json.dumps(
                {
                    "model": GROQ_MODEL,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                }
            ),
            timeout=REQUEST_TIMEOUT_S,
        )
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]
    except Exception as e:
        logger.warning("Groq chat call failed: %s", e)
        return None