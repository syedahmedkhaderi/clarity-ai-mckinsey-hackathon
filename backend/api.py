"""FastAPI surface.

/api/batch/run returns immediately with a batch_id. The graph runs on a worker
thread and /api/batch/{id}/trace is pollable while it runs, so the UI can show
the pipeline moving rather than a spinner.
"""

from __future__ import annotations

from typing import Any

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend import config, db, llm, service
from backend.graph import GRAPH_EDGES, GRAPH_NODES, REPLAN_ENTRY, REVIEWER_GATED_NODES
from backend.lms import mock_api
from backend.models import Override
from backend.routers import chat, email, insights, uploads

@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init_db()
    yield


app = FastAPI(title="LOOP", version="1.0", lifespan=lifespan,
              description="Agentic marking, diagnosis and intervention planning for "
                          "Meridian Foundation learning centres.")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                   allow_headers=["*"])
for _router in (uploads.router, email.router, chat.router, insights.router):
    app.include_router(_router)


class RunRequest(BaseModel):
    assessment_id: str
    cohort_id: str = "C1"
    facilitator_minutes: int = Field(default=config.DEFAULT_FACILITATOR_MINUTES, ge=15, le=600)


class OverrideRequest(BaseModel):
    type: str
    target_id: str
    new_value: str | None = None
    reason: str = ""


class ApproveRequest(BaseModel):
    item_ids: list[str]


class ResolveRequest(BaseModel):
    escalation_id: str
    resolution: str = ""


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "mode": llm.describe(),
        "provider": config.PROVIDER,
        "model_fast": config.MODEL_FAST if llm.available() else None,
        "model_smart": config.MODEL_SMART if llm.available() else None,
        "ai_available": llm.available(),
        "email_configured": bool(config.GMAIL_USER and config.GMAIL_APP_PASSWORD),
        "graph": {"nodes": GRAPH_NODES, "edges": GRAPH_EDGES,
                  "reviewer_gated": REVIEWER_GATED_NODES, "replan_entry": REPLAN_ENTRY},
        "thresholds": {
            "mark_confidence_floor": config.MARK_CONFIDENCE_FLOOR,
            "diagnosis_confidence_floor": config.DIAGNOSIS_CONFIDENCE_FLOOR,
            "ambiguity_gap": config.AMBIGUITY_GAP,
            "shared_misconception_share": config.SHARED_MISCONCEPTION_SHARE,
            "min_learners_for_pattern": config.MIN_LEARNERS_FOR_PATTERN,
            "high_severity_floor": config.HIGH_SEVERITY_FLOOR,
        },
    }


@app.get("/api/lms/courses")
def courses() -> list[dict[str, Any]]:
    return mock_api.get_courses()


@app.get("/api/lms/courses/{course_id}/assignments")
def assignments(course_id: str) -> list[dict[str, Any]]:
    return mock_api.get_assignments(course_id)


@app.get("/api/lms/assignments/{assessment_id}/submissions")
def submissions(assessment_id: str) -> list[dict[str, Any]]:
    return mock_api.get_submissions(assessment_id)


@app.get("/api/taxonomy")
def taxonomy() -> dict[str, Any]:
    return mock_api.taxonomy()


@app.get("/api/assessments/{assessment_id}/questions")
def questions(assessment_id: str) -> list[dict[str, Any]]:
    return mock_api.get_assessment_questions(assessment_id)


@app.post("/api/batch/run")
def run_batch(req: RunRequest) -> dict[str, Any]:
    try:
        cohort_id = mock_api.resolve_run(req.assessment_id, req.cohort_id)
    except mock_api.RunRefused as refusal:
        raise HTTPException(refusal.status, detail={"code": refusal.code,
                                                    "message": refusal.message})
    batch_id = service.start_batch(req.assessment_id, cohort_id, req.facilitator_minutes)
    return {"batch_id": batch_id, "status": "running"}


@app.get("/api/batches")
def batches() -> list[dict[str, Any]]:
    return service.list_batches()


@app.get("/api/batch/{batch_id}")
def batch(batch_id: str) -> dict[str, Any]:
    return _require(batch_id)


@app.get("/api/batch/{batch_id}/trace")
def batch_trace(batch_id: str, since: int = 0) -> dict[str, Any]:
    _require(batch_id)
    events, status = service.get_trace(batch_id)
    return {"batch_id": batch_id, "status": status,
            "total": len(events), "events": events[since:]}


@app.get("/api/batch/{batch_id}/plan")
def batch_plan(batch_id: str) -> dict[str, Any]:
    state = _require(batch_id)
    return {"plan": state.get("plan"), "changes": state.get("changes") or []}


@app.get("/api/batch/{batch_id}/escalations")
def batch_escalations(batch_id: str) -> list[dict[str, Any]]:
    return _require(batch_id).get("escalations") or []


@app.get("/api/cohort/{cohort_id}/patterns")
def cohort_patterns(cohort_id: str, batch_id: str | None = None) -> dict[str, Any]:
    if batch_id:
        return _require(batch_id).get("patterns") or {}
    for row in service.list_batches():
        if row["cohort_id"] == cohort_id:
            return (service.get_batch(row["batch_id"]) or {}).get("patterns") or {}
    raise HTTPException(404, f"No batch found for cohort {cohort_id}")


@app.get("/api/learner/{learner_id}/profile")
def learner_profile(learner_id: str, batch_id: str | None = None) -> dict[str, Any]:
    """The error profile across assessments. This is what makes LOOP a memory
    rather than a one-shot marker."""
    rows = db.full_profile(learner_id)
    by_assessment: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        by_assessment.setdefault(row["assessment_id"], []).append(row)
    roster = {l["learner_id"]: l["name"] for l in mock_api.get_roster()}
    context = None
    if batch_id:
        state = service.get_batch(batch_id) or {}
        context = next((c for c in state.get("learners") or []
                        if c["learner_id"] == learner_id), None)
    recurring = [node for node in {r["taxonomy_node"] for r in rows}
                 if sum(1 for r in rows if r["taxonomy_node"] == node) > 1]
    return {"learner_id": learner_id, "name": roster.get(learner_id, learner_id),
            "context": context, "assessments": by_assessment,
            "recurring_nodes": sorted(recurring), "entries": rows}


@app.post("/api/batch/{batch_id}/override")
def override(batch_id: str, req: OverrideRequest) -> dict[str, Any]:
    if req.type not in ("mark", "diagnosis", "learner_unavailable"):
        raise HTTPException(400, f"Unknown override type {req.type}")
    try:
        return service.apply_override(batch_id, Override(**req.model_dump()))
    except KeyError:
        raise HTTPException(404, f"Unknown batch {batch_id}")


@app.post("/api/batch/{batch_id}/approve")
def approve(batch_id: str, req: ApproveRequest) -> dict[str, Any]:
    try:
        return service.approve(batch_id, req.item_ids)
    except KeyError:
        raise HTTPException(404, f"Unknown batch {batch_id}")


@app.post("/api/batch/{batch_id}/resolve")
def resolve(batch_id: str, req: ResolveRequest) -> dict[str, Any]:
    try:
        return service.resolve_escalation(batch_id, req.escalation_id, req.resolution)
    except KeyError:
        raise HTTPException(404, f"Unknown batch {batch_id}")


@app.post("/api/lms/assignments/{assessment_id}/feedback")
def post_feedback(assessment_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    return mock_api.post_feedback(assessment_id, payload)


def _require(batch_id: str) -> dict[str, Any]:
    state = service.get_batch(batch_id)
    if state is None:
        raise HTTPException(404, f"Unknown batch {batch_id}")
    return state
