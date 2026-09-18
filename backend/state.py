"""The LangGraph state object. Frozen early; the frontend contract depends on it."""

from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Any, TypedDict

from backend.models import (
    CohortPatterns,
    Diagnosis,
    Escalation,
    InterventionPlan,
    LearnerContext,
    Mark,
    Override,
    PlanChange,
    Submission,
    TraceEvent,
)


class LoopState(TypedDict, total=False):
    batch_id: str
    assessment_id: str
    cohort_id: str
    facilitator_minutes: int
    submissions: list[Submission]
    learners: list[LearnerContext]
    marks: list[Mark]                 # survivors of the reviewer gate
    all_marks: list[Mark]             # every mark, including the escalated ones
    diagnoses: list[Diagnosis]        # survivors of the reviewer gate
    all_diagnoses: list[Diagnosis]    # every diagnosis, including the escalated ones
    patterns: CohortPatterns | None
    plan: InterventionPlan | None
    escalations: list[Escalation]
    trace: list[TraceEvent]
    overrides: list[Override]
    changes: list[PlanChange]
    status: str


def new_state(batch_id: str, assessment_id: str, cohort_id: str,
              facilitator_minutes: int) -> LoopState:
    return LoopState(
        batch_id=batch_id,
        assessment_id=assessment_id,
        cohort_id=cohort_id,
        facilitator_minutes=facilitator_minutes,
        submissions=[], learners=[], marks=[], all_marks=[],
        diagnoses=[], all_diagnoses=[],
        patterns=None, plan=None,
        escalations=[], trace=[], overrides=[], changes=[],
        status="running",
    )


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


# The graph runs on a worker thread and its state only reaches the API when the
# whole run finishes. That is far too late for a UI that is meant to show the
# agents working, so every event is also published here the moment it happens and
# the trace endpoint reads from this.
_LIVE_TRACE: dict[str, list[TraceEvent]] = {}
_TRACE_LOCK = threading.Lock()


def trace(state: LoopState, agent: str, action: str, detail: str,
          duration_ms: int = 0, level: str = "info") -> None:
    """Appends a trace event. Every node emits one at entry and one at exit."""
    event = TraceEvent(agent=agent, action=action, detail=detail,
                       timestamp=now_iso(), duration_ms=duration_ms, level=level)
    state.setdefault("trace", []).append(event)
    batch_id = state.get("batch_id")
    if batch_id:
        with _TRACE_LOCK:
            _LIVE_TRACE.setdefault(batch_id, []).append(event)


def live_trace(batch_id: str) -> list[TraceEvent]:
    with _TRACE_LOCK:
        return list(_LIVE_TRACE.get(batch_id, []))


def reset_live_trace(batch_id: str) -> None:
    with _TRACE_LOCK:
        _LIVE_TRACE.pop(batch_id, None)


def serialise(state: LoopState) -> dict[str, Any]:
    """Converts the state to plain JSON for the API and the committed fixture."""

    def dump(value: Any) -> Any:
        if value is None:
            return None
        if isinstance(value, list):
            return [dump(v) for v in value]
        return value.model_dump() if hasattr(value, "model_dump") else value

    return {key: dump(value) for key, value in state.items()}
