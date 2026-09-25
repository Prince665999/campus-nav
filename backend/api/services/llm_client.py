"""
llm_client.py

Thin wrapper around Groq's chat completions API.

If GROQ_API_KEY isn't set, every function returns None. Callers check
for None and fall back to non-LLM paths.
"""

import json
import logging
import os

logger = logging.getLogger(__name__)

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "openai/gpt-oss-120b"

REQUEST_TIMEOUT_S = 30


def is_available() -> bool:
    return bool(os.environ.get("GROQ_API_KEY"))


def chat(messages, temperature=0.4, max_tokens=600):
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
        text = data["choices"][0]["message"]["content"]
        logger.debug("Groq response: %d chars", len(text or ""))
        return text
    except Exception as e:
        logger.warning("Groq chat call failed: %s", e)
        return None