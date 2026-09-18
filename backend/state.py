"""The LangGraph state object. Frozen early; the frontend contract depends on it."""

from __future__ import annotations

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
    marks: list[Mark]
    diagnoses: list[Diagnosis]
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
        submissions=[], learners=[], marks=[], diagnoses=[],
        patterns=None, plan=None,
        escalations=[], trace=[], overrides=[], changes=[],
        status="running",
    )


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def trace(state: LoopState, agent: str, action: str, detail: str,
          duration_ms: int = 0, level: str = "info") -> None:
    """Appends a trace event. Every node emits one at entry and one at exit."""
    state.setdefault("trace", []).append(
        TraceEvent(agent=agent, action=action, detail=detail,
                   timestamp=now_iso(), duration_ms=duration_ms, level=level)
    )


def serialise(state: LoopState) -> dict[str, Any]:
    """Converts the state to plain JSON for the API and the committed fixture."""

    def dump(value: Any) -> Any:
        if value is None:
            return None
        if isinstance(value, list):
            return [dump(v) for v in value]
        return value.model_dump() if hasattr(value, "model_dump") else value

    return {key: dump(value) for key, value in state.items()}
