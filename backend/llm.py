"""Single point of contact with the model provider.

Three guarantees the rest of the backend relies on:

1. Structured output only. Every call parses into a Pydantic model. Nothing
   regexes a model response.
2. No call can crash the graph. Any exception, missing credential or malformed
   response returns None, and the calling agent falls back to its deterministic
   path and escalates rather than inventing an answer.
3. Independent calls are fanned out. A cohort marked one response at a time at
   three seconds a call is not a live demo.

This is also the only module that knows which provider is in use. Swapping
providers is a change here and nowhere else.
"""

from __future__ import annotations

import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Sequence, TypeVar

from pydantic import BaseModel

from backend import config

log = logging.getLogger("loop.llm")

T = TypeVar("T", bound=BaseModel)

_CLIENTS: dict[str, Any] = {}


def available() -> bool:
    return not config.OFFLINE


def describe() -> str:
    """Human-readable mode, shown in the API health endpoint and the UI."""
    if config.OFFLINE:
        return "offline deterministic rules"
    if config.PROVIDER == "azure":
        return f"QuantumBlack Azure gateway, {config.MODEL_FAST} and {config.MODEL_SMART}"
    return f"OpenAI, {config.MODEL_FAST} and {config.MODEL_SMART}"


def _build(model: str) -> Any | None:
    """Creates the chat client for the detected provider."""
    # One retry only. A second silent backoff inside the client turns a slow call
    # into a very slow one, and the deterministic fallback is right there.
    common = {"timeout": config.LLM_TIMEOUT_SECONDS, "max_retries": 1}
    if config.PROVIDER == "azure":
        from langchain_openai import AzureChatOpenAI

        # Temperature is deliberately not set. The gateway's current models
        # reject anything but the default, and structured output plus a fixed
        # prompt is what makes a run repeatable, not temperature.
        return AzureChatOpenAI(
            azure_endpoint=config.AZURE_ENDPOINT,
            api_key=config.AZURE_CREDENTIAL,
            api_version=config.AZURE_API_VERSION,
            azure_deployment=model,
            **common,
        )
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(model=model, api_key=config.OPENAI_API_KEY, temperature=0, **common)


def _client(model: str, schema: type[BaseModel]) -> Any | None:
    key = f"{config.PROVIDER}:{model}:{schema.__name__}"
    if key in _CLIENTS:
        return _CLIENTS[key]
    try:
        llm = _build(model)
        if llm is None:
            return None
        # strict json_schema, not the default. Without it the smaller models
        # quietly omit a required field, the response fails validation, and the
        # agent silently falls back to rules while reporting itself as running
        # on the model. Strict mode makes the contract enforceable at the API.
        try:
            _CLIENTS[key] = llm.with_structured_output(schema, method="json_schema",
                                                       strict=True)
        except Exception:
            _CLIENTS[key] = llm.with_structured_output(schema)
        return _CLIENTS[key]
    except Exception as exc:  # pragma: no cover - provider or import failure
        log.warning("llm client unavailable for %s: %s", model, exc)
        return None


def call(system: str, user: str, schema: type[T], smart: bool = False) -> T | None:
    """Returns a parsed model instance, or None if the call could not be trusted."""
    if config.OFFLINE:
        return None
    model = config.MODEL_SMART if smart else config.MODEL_FAST
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


def call_many(system: str, users: Sequence[str], schema: type[T],
              smart: bool = False,
              on_progress: Callable[[int, int], None] | None = None) -> list[T | None]:
    """Runs independent calls concurrently, preserving input order.

    A failure in one call is a None in that slot, never an exception, so one bad
    response cannot take down a whole batch.

    on_progress(done, total) fires as each call lands. A model step that takes
    ten seconds with no output looks identical to a hang, so the agents use this
    to report progress while they wait.
    """
    if config.OFFLINE or not users:
        return [None] * len(users)
    total = len(users)
    workers = max(1, min(config.LLM_CONCURRENCY, total))
    done = 0
    lock = threading.Lock()

    def one(user: str) -> T | None:
        nonlocal done
        result = call(system, user, schema, smart)
        if on_progress:
            with lock:
                done += 1
                try:
                    on_progress(done, total)
                except Exception:  # progress reporting must never break a run
                    pass
        return result

    with ThreadPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(one, users))
