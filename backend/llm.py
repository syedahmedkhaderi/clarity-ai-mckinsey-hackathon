"""Single point of contact with the model provider.

Two guarantees the rest of the backend relies on:

1. Structured output only. Every call parses into a Pydantic model. Nothing
   regexes a model response.
2. No call can crash the graph. Any exception, missing key or malformed
   response returns None, and the calling agent falls back to its deterministic
   path and escalates rather than inventing an answer.
"""

from __future__ import annotations

import logging
from typing import Any, TypeVar

from pydantic import BaseModel

from backend.config import MODEL_FAST, MODEL_SMART, OFFLINE, OPENAI_API_KEY

log = logging.getLogger("loop.llm")

T = TypeVar("T", bound=BaseModel)

_CLIENTS: dict[str, Any] = {}


def available() -> bool:
    return not OFFLINE


def _client(model: str, schema: type[BaseModel]) -> Any | None:
    key = f"{model}:{schema.__name__}"
    if key in _CLIENTS:
        return _CLIENTS[key]
    try:
        from langchain_openai import ChatOpenAI

        llm = ChatOpenAI(model=model, api_key=OPENAI_API_KEY, temperature=0, timeout=60,
                         max_retries=1)
        _CLIENTS[key] = llm.with_structured_output(schema)
        return _CLIENTS[key]
    except Exception as exc:  # pragma: no cover - provider or import failure
        log.warning("llm client unavailable for %s: %s", model, exc)
        return None


def call(system: str, user: str, schema: type[T], smart: bool = False) -> T | None:
    """Returns a parsed model instance, or None if the call could not be trusted."""
    if OFFLINE:
        return None
    model = MODEL_SMART if smart else MODEL_FAST
    runnable = _client(model, schema)
    if runnable is None:
        return None
    try:
        from langchain_core.messages import HumanMessage, SystemMessage

        result = runnable.invoke([SystemMessage(content=system), HumanMessage(content=user)])
        return result if isinstance(result, schema) else schema.model_validate(result)
    except Exception as exc:
        log.warning("llm call failed (%s): %s", model, exc)
        return None
