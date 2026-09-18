"""Per-test totals for every student, for the trend and sparkline views.

Built from each test's latest finished batch, so it is a read of what the
pipeline already decided and adds no analysis of its own.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from backend import service
from backend.lms import mock_api

router = APIRouter(prefix="/api/insights", tags=["insights"])


def _latest_batches() -> dict[str, dict[str, Any]]:
    """The newest batch that actually holds marks, keyed by assessment.

    A run that is still going, or one that stopped before marking, has no marks.
    Taking it would blank a test's history for the length of a re-run.
    """
    latest: dict[str, dict[str, Any]] = {}
    for row in service.list_batches():
        aid = row["assessment_id"]
        if aid in latest:
            continue
        state = service.get_batch(row["batch_id"]) or {}
        if state.get("all_marks"):
            latest[aid] = state
    return latest


def _student_totals(state: dict[str, Any], names: dict[str, str]) -> list[dict[str, Any]]:
    """Sum of every mark a student was given in one batch.

    Escalated marks are in all_marks but not in marks, so they count towards the
    total and keep the student provisional. A teacher's mark override edits the
    surviving mark only, so that value wins where one exists.
    """
    surviving = {(m["learner_id"], m["question_id"]): m for m in state.get("marks") or []}
    totals: dict[str, dict[str, Any]] = {}
    for mark in state["all_marks"]:
        lid = mark["learner_id"]
        kept = surviving.get((lid, mark["question_id"]))
        row = totals.setdefault(lid, {"learner_id": lid, "name": names.get(lid, lid),
                                      "awarded": 0.0, "provisional": False})
        row["awarded"] += (kept or mark)["awarded"]
        row["provisional"] = row["provisional"] or kept is None or bool(kept["provisional"])
    return sorted(totals.values(), key=lambda r: r["learner_id"])


@router.get("/history")
def history(course_id: str = "C1") -> dict[str, Any]:
    names = {l["learner_id"]: l["name"] for l in mock_api.get_roster()}
    latest = _latest_batches()
    tests = []
    for assignment in mock_api.get_assignments(course_id):
        state = latest.get(assignment["id"])
        if state is None:
            continue
        tests.append({
            "assessment_id": assignment["id"],
            "name": assignment["display_name"],
            "points_possible": assignment["points_possible"],
            "learners": _student_totals(state, names),
        })
    return {"tests": tests}
