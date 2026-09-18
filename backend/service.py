"""Batch orchestration: running the graph, persisting results, applying
facilitator overrides and re-planning.

The override path is the behaviour the whole product rests on. A facilitator
disagrees, the agent takes the correction as fact, recomputes the cohort picture
underneath it, and rebuilds the plan. The diff between the old and new plan is
computed here so the UI can show exactly what the correction changed.
"""

from __future__ import annotations

import threading
import uuid
from datetime import datetime, timezone
from typing import Any

from backend import config, db
from backend.graph import build_graph, build_replan_graph
from backend.lms import mock_api
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
from backend.state import (LoopState, live_trace, new_state, reset_live_trace,
                           serialise, trace)

_LIVE: dict[str, dict[str, Any]] = {}
_LOCK = threading.Lock()


def start_batch(assessment_id: str, cohort_id: str, minutes: int) -> str:
    """Runs the graph on a worker thread so the trace endpoint can be polled
    while it is still running."""
    batch_id = f"B-{assessment_id}-{uuid.uuid4().hex[:6]}"
    state = new_state(batch_id, assessment_id, cohort_id, minutes)
    reset_live_trace(batch_id)
    with _LOCK:
        _LIVE[batch_id] = serialise(state)
    threading.Thread(target=_run, args=(batch_id, state), daemon=True).start()
    return batch_id


def _run(batch_id: str, state: LoopState) -> None:
    try:
        result = build_graph().invoke(state)
        result.setdefault("status", "complete")
        if result["status"] == "running":
            result["status"] = "complete"
    except Exception as exc:  # the demo must never show a stack trace
        trace(state, "graph", "error",
              f"The run stopped early: {type(exc).__name__}. Everything completed before this "
              f"point is kept and shown below.", level="warning")
        state["status"] = "failed"
        result = state
    _persist(result)


def _persist(result: LoopState) -> None:
    payload = serialise(result)
    with _LOCK:
        _LIVE[payload["batch_id"]] = payload
    created = datetime.now(timezone.utc).isoformat(timespec="seconds")
    db.save_batch(payload, created)
    db.record_marks(payload["batch_id"], payload["assessment_id"], payload.get("marks") or [])
    db.record_diagnoses(payload["batch_id"], payload["assessment_id"],
                        payload.get("diagnoses") or [])


def get_trace(batch_id: str) -> tuple[list[dict[str, Any]], str]:
    """Returns (events, status) from the freshest source available.

    While the graph is running the persisted state is still the one captured at
    submit time, so the live buffer is the only thing that has anything in it.
    """
    payload = get_batch(batch_id)
    persisted = (payload or {}).get("trace") or []
    live = [e.model_dump() for e in live_trace(batch_id)]
    events = live if len(live) > len(persisted) else persisted
    return events, (payload or {}).get("status", "running")


def get_batch(batch_id: str) -> dict[str, Any] | None:
    with _LOCK:
        if batch_id in _LIVE:
            return _LIVE[batch_id]
    return db.load_batch(batch_id)


def list_batches() -> list[dict[str, Any]]:
    return db.list_batches()


def apply_override(batch_id: str, override: Override) -> dict[str, Any]:
    """Applies a facilitator correction and re-enters the graph at cohort_analyst."""
    payload = get_batch(batch_id)
    if payload is None:
        raise KeyError(batch_id)
    previous_plan = payload.get("plan")

    state = _rehydrate(payload)
    override.created_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    state["overrides"] = state.get("overrides", []) + [override]
    db.record_override(batch_id, override.model_dump())

    before = len(state["diagnoses"])
    _apply(state, override)
    trace(state, "facilitator", "override",
          f"{override.type} override on {override.target_id}"
          f"{' -> ' + override.new_value if override.new_value else ''}. "
          f"Reason: {override.reason or 'not given'}. "
          f"Diagnoses in play {before} -> {len(state['diagnoses'])}. "
          f"Re-entering the graph at cohort_analyst; marks below the override are untouched.",
          level="decision")

    state["escalations"] = [e for e in state["escalations"] if e.reason_code != "BUDGET_OVERFLOW"]
    state["status"] = "running"
    result = build_replan_graph().invoke(state)
    result.setdefault("status", "complete")
    if result["status"] == "running":
        result["status"] = "complete"
    result["changes"] = _diff_plans(previous_plan, serialise(result).get("plan"))
    for change in result["changes"]:
        trace(result, "planner", "replan_change", change.detail, level="decision")
    _persist(result)
    return serialise(result)


def _apply(state: LoopState, override: Override) -> None:
    """target_id is 'learner_id:question_id' for mark and diagnosis overrides,
    and a bare learner_id for learner_unavailable."""
    if override.type == "learner_unavailable":
        lid = override.target_id
        state["learners"] = [c for c in state["learners"] if c.learner_id != lid]
        state["diagnoses"] = [d for d in state["diagnoses"] if d.learner_id != lid]
        state["marks"] = [m for m in state["marks"] if m.learner_id != lid]
        return

    learner_id, _, question_id = override.target_id.partition(":")
    if override.type == "diagnosis":
        kept: list[Diagnosis] = []
        for d in state["diagnoses"]:
            if d.learner_id == learner_id and d.question_id == question_id:
                if override.new_value:
                    d.taxonomy_node = override.new_value
                    d.confidence = 1.0
                    d.source = "fallback"
                    d.reasoning = f"Set by the facilitator: {override.reason or 'no reason given'}."
                    kept.append(d)
                continue
            kept.append(d)
        state["diagnoses"] = kept
        return

    for m in state["marks"]:
        if m.learner_id == learner_id and m.question_id == question_id and override.new_value:
            m.awarded = float(override.new_value)
            m.confidence = 1.0
            m.provisional = False
    if override.new_value is not None:
        state["diagnoses"] = [d for d in state["diagnoses"]
                              if not (d.learner_id == learner_id and d.question_id == question_id
                                      and float(override.new_value) >= _max_marks(question_id))]


def _max_marks(question_id: str) -> float:
    q = mock_api.get_question(question_id)
    return float(q["max_marks"]) if q else 0.0


def _diff_plans(old: dict[str, Any] | None, new: dict[str, Any] | None) -> list[PlanChange]:
    if not new:
        return []
    if not old:
        return [PlanChange(kind="added", detail=f"First plan produced: "
                                                f"{len(new['scheduled'])} actions.")]
    every = old["scheduled"] + old["dropped"] + new["scheduled"] + new["dropped"]
    titles = {a["action_id"]: a["title"] for a in every}
    kinds = {a["action_id"]: a["type"] for a in every}
    old_ids = {a["action_id"] for a in old["scheduled"]}
    new_ids = {a["action_id"] for a in new["scheduled"]}

    # Feedback reviews are five-minute fillers that shuffle whenever anything
    # larger moves. Listing each one individually would bury the change that
    # actually matters, so they are summarised on one line.
    def is_filler(aid: str) -> bool:
        return kinds.get(aid) == "feedback_review"

    changes: list[PlanChange] = []
    for aid in sorted(a for a in old_ids - new_ids if not is_filler(a)):
        changes.append(PlanChange(kind="removed", action_id=aid,
                                  detail=f"Withdrawn: {titles.get(aid, aid)}"))
    for aid in sorted(a for a in new_ids - old_ids if not is_filler(a)):
        was_dropped = any(a["action_id"] == aid for a in old["dropped"])
        changes.append(PlanChange(
            kind="rescheduled" if was_dropped else "added", action_id=aid,
            detail=(f"Now scheduled with the freed time: {titles.get(aid, aid)}"
                    if was_dropped else f"Newly scheduled: {titles.get(aid, aid)}")))
    before = sum(1 for a in old["scheduled"] if a["type"] == "feedback_review")
    after = sum(1 for a in new["scheduled"] if a["type"] == "feedback_review")
    if before != after:
        changes.append(PlanChange(
            kind="rescheduled" if after > before else "removed",
            detail=f"Feedback reviews that fit the remaining time moved from {before} to "
                   f"{after}. Drafts are still written for every learner."))
    if old["minutes_used"] != new["minutes_used"]:
        changes.append(PlanChange(
            kind="budget",
            detail=f"Minutes used moved from {old['minutes_used']} to {new['minutes_used']} "
                   f"of {new['budget_minutes']}."))
    return changes


def _rehydrate(payload: dict[str, Any]) -> LoopState:
    """Rebuilds a typed state from a persisted batch so the re-plan graph can run
    on it without re-marking anything."""
    state: LoopState = {
        "batch_id": payload["batch_id"], "assessment_id": payload["assessment_id"],
        "cohort_id": payload["cohort_id"],
        "facilitator_minutes": payload["facilitator_minutes"],
        "submissions": [Submission(**s) for s in payload.get("submissions") or []],
        "learners": [LearnerContext(**c) for c in payload.get("learners") or []],
        "marks": [Mark(**m) for m in payload.get("marks") or []],
        "all_marks": [Mark(**m) for m in payload.get("all_marks") or []],
        "diagnoses": [Diagnosis(**d) for d in payload.get("diagnoses") or []],
        "all_diagnoses": [Diagnosis(**d) for d in payload.get("all_diagnoses") or []],
        "patterns": CohortPatterns(**payload["patterns"]) if payload.get("patterns") else None,
        "plan": InterventionPlan(**payload["plan"]) if payload.get("plan") else None,
        "escalations": [Escalation(**e) for e in payload.get("escalations") or []],
        "trace": [TraceEvent(**t) for t in payload.get("trace") or []],
        "overrides": [Override(**o) for o in payload.get("overrides") or []],
        "changes": [], "status": payload.get("status", "complete"),
    }
    return state


def approve(batch_id: str, item_ids: list[str]) -> dict[str, Any]:
    """item_ids are 'learner_id:question_id'. Approval is what makes a mark count."""
    payload = get_batch(batch_id)
    if payload is None:
        raise KeyError(batch_id)
    keys = [(i.split(":")[0], i.split(":")[1]) for i in item_ids if ":" in i]
    db.approve_marks(batch_id, keys)
    approved = set(keys)
    for m in payload.get("marks") or []:
        if (m["learner_id"], m["question_id"]) in approved:
            m["provisional"] = False
    for fb in (payload.get("plan") or {}).get("feedback", []):
        if any(lid == fb["learner_id"] for lid, _ in approved):
            fb["approved"] = True
    with _LOCK:
        _LIVE[batch_id] = payload
    db.save_batch(payload, datetime.now(timezone.utc).isoformat(timespec="seconds"))
    return {"approved": len(approved), "batch_id": batch_id}


def resolve_escalation(batch_id: str, escalation_id: str, resolution: str) -> dict[str, Any]:
    payload = get_batch(batch_id)
    if payload is None:
        raise KeyError(batch_id)
    for e in payload.get("escalations") or []:
        if e["escalation_id"] == escalation_id:
            e["resolved"] = True
            e["resolution"] = resolution
    with _LOCK:
        _LIVE[batch_id] = payload
    db.save_batch(payload, datetime.now(timezone.utc).isoformat(timespec="seconds"))
    return {"escalation_id": escalation_id, "resolved": True}


def run_sync(assessment_id: str, cohort_id: str | None = None,
             minutes: int | None = None) -> dict[str, Any]:
    """Blocking run. Used by the fixture builder, the evaluator and the tests."""
    meta = mock_api.get_cohort_meta(assessment_id)
    state = new_state(f"B-{assessment_id}-sync", assessment_id,
                      cohort_id or meta["cohort_id"],
                      minutes or config.DEFAULT_FACILITATOR_MINUTES)
    result = build_graph().invoke(state)
    result.setdefault("status", "complete")
    if result["status"] == "running":
        result["status"] = "complete"
    _persist(result)
    return serialise(result)


def has_running_batch(assessment_id: str) -> bool:
    """True while a graph run for this assessment is still in flight."""
    with _LOCK:
        return any(s.get("assessment_id") == assessment_id and s.get("status") == "running"
                   for s in _LIVE.values())


def forget_assessment(assessment_id: str) -> None:
    """Drops the in-memory copy of every batch for a deleted test, so a batch that
    is gone from the database is not still served from the cache."""
    with _LOCK:
        for batch_id in [b for b, s in _LIVE.items() if s.get("assessment_id") == assessment_id]:
            del _LIVE[batch_id]
