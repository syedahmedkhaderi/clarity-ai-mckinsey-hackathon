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
import time
from concurrent.futures import ThreadPoolExecutor, wait
from typing import Any, Callable, Sequence, TypeVar

from pydantic import BaseModel

from backend import config

log = logging.getLogger("loop.llm")

T = TypeVar("T", bound=BaseModel)

_CLIENTS: dict[str, Any] = {}


class _Breaker:
    """Trips to the deterministic rules when the provider stops answering.

    Without this, an endpoint that is down costs a full timeout on every
    remaining call in the run. With 36 marking calls and a 30 second timeout that
    is minutes of waiting to reach an answer the rules could have produced
    immediately. After LLM_FAILURE_THRESHOLD consecutive failures the breaker
    opens and every later call returns None at once, which every agent already
    handles. One call is let through after the cooldown to see if it recovered.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._consecutive = 0
        self._opened_at: float | None = None
        self._trips = 0
        self.last_error: str | None = None

    @property
    def is_open(self) -> bool:
        with self._lock:
            if self._opened_at is None:
                return False
            if time.monotonic() - self._opened_at >= config.LLM_BREAKER_COOLDOWN_SECONDS:
                # Cooldown elapsed. Let the next call through as a probe.
                self._opened_at = None
                self._consecutive = 0
                return False
            return True

    @property
    def trips(self) -> int:
        with self._lock:
            return self._trips

    def record_success(self) -> None:
        with self._lock:
            self._consecutive = 0
            self._opened_at = None

    def record_failure(self, error: str) -> bool:
        """Returns True if this failure opened the breaker."""
        with self._lock:
            self.last_error = error
            self._consecutive += 1
            if self._consecutive >= config.LLM_FAILURE_THRESHOLD and self._opened_at is None:
                self._opened_at = time.monotonic()
                self._trips += 1
                return True
            return False

    def reset(self) -> None:
        with self._lock:
            self._consecutive = 0
            self._opened_at = None
            self.last_error = None


breaker = _Breaker()


def available() -> bool:
    """True when a model call is worth attempting at all."""
    return not config.OFFLINE and not breaker.is_open


def degraded() -> bool:
    """True when credentials exist but the provider is not answering."""
    return not config.OFFLINE and breaker.is_open


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


def call(system: str, user: str, schema: type[T], smart: bool = False,
         on_trip: Callable[[str], None] | None = None) -> T | None:
    """Returns a parsed model instance, or None if the call could not be trusted.

    None is not an error path the caller has to handle specially. Every agent
    treats it as "use the rules", which is why a provider outage degrades the
    output rather than breaking the run.
    """
    if config.OFFLINE or breaker.is_open:
        return None
    model = config.MODEL_SMART if smart else config.MODEL_FAST
    # Everything from building the client onward is inside the guard. A failure
    # while constructing a client, importing a provider package or validating a
    # response is just as fatal to a run as a failed request, and the caller's
    # contract is that this function returns a value or None. It never raises.
    try:
        runnable = _client(model, schema)
        if runnable is None:
            raise RuntimeError(f"no usable client for {model}")

        from langchain_core.messages import HumanMessage, SystemMessage

        result = runnable.invoke([SystemMessage(content=system), HumanMessage(content=user)])
        parsed = result if isinstance(result, schema) else schema.model_validate(result)
        breaker.record_success()
        return parsed
    except Exception as exc:
        log.warning("llm call failed (%s): %s", model, exc)
        if breaker.record_failure(f"{type(exc).__name__}: {exc}") and on_trip:
            try:
                on_trip(f"{type(exc).__name__}: {str(exc)[:160]}")
            except Exception:
                pass
        return None


def call_many(system: str, users: Sequence[str], schema: type[T],
              smart: bool = False,
              on_progress: Callable[[int, int], None] | None = None,
              on_timeout: Callable[[int, int], None] | None = None,
              on_trip: Callable[[str], None] | None = None,
              budget_seconds: int | None = None) -> list[T | None]:
    """Runs independent calls concurrently, preserving input order.

    A failure in one call is a None in that slot, never an exception, so one bad
    response cannot take down a whole batch.

    on_progress(done, total) fires as each call lands. A model step that takes
    ten seconds with no output looks identical to a hang, so the agents use this
    to report progress while they wait.

    The whole batch is capped by a wall-clock budget. Calls still in flight when
    it expires are abandoned and reported through on_timeout, and the caller
    falls back to rules for those slots. A stalled provider must degrade a run,
    never hang it.
    """
    if config.OFFLINE or breaker.is_open or not users:
        return [None] * len(users)
    total = len(users)
    workers = max(1, min(config.LLM_CONCURRENCY, total))
    budget = budget_seconds or config.LLM_STAGE_BUDGET_SECONDS
    done = 0
    lock = threading.Lock()

    def one(user: str) -> T | None:
        nonlocal done
        try:
            result = call(system, user, schema, smart, on_trip=on_trip)
        except Exception as exc:  # call() should not raise; belt and braces
            log.warning("llm worker raised: %s", exc)
            result = None
        if on_progress:
            with lock:
                done += 1
                try:
                    on_progress(done, total)
                except Exception:  # progress reporting must never break a run
                    pass
        return result

    results: list[T | None] = [None] * total
    pool = ThreadPoolExecutor(max_workers=workers)
    try:
        futures = {pool.submit(one, u): i for i, u in enumerate(users)}
        finished, unfinished = wait(futures, timeout=budget)
        for f in finished:
            try:
                results[futures[f]] = f.result()
            except Exception as exc:  # already logged in call()
                log.warning("llm task failed: %s", exc)
        if unfinished:
            log.warning("%d of %d calls did not return within %ss; "
                        "falling back to rules for those", len(unfinished), total, budget)
            for f in unfinished:
                f.cancel()
            if on_timeout:
                try:
                    on_timeout(len(unfinished), total)
                except Exception:
                    pass
    finally:
        # Never block on stragglers. Whatever they eventually return is discarded
        # and the deterministic path has already covered those items.
        pool.shutdown(wait=False, cancel_futures=True)
    return results
