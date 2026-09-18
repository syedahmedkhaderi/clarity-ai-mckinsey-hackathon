"""Mock LMS backed by the generated submissions.

The shape deliberately mirrors a Canvas or Moodle style REST API so the
integration story is a connector swap, not a rewrite:

    GET  /lms/courses                          -> Canvas  GET /api/v1/courses
    GET  /lms/courses/{id}/assignments         -> Canvas  GET /api/v1/courses/:id/assignments
    GET  /lms/assignments/{id}/submissions     -> Canvas  GET /api/v1/courses/:cid/assignments/:id/submissions
    POST /lms/assignments/{id}/feedback        -> Canvas  PUT /api/v1/courses/:cid/assignments/:id/submissions/:uid

Moodle equivalents are core_course_get_courses, mod_assign_get_assignments,
mod_assign_get_submissions and mod_assign_save_grade.
"""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

from backend.config import DATA_DIR, GENERATED_DIR

_FEEDBACK_OUTBOX: list[dict[str, Any]] = []


@lru_cache(maxsize=1)
def _submissions_file() -> dict[str, Any]:
    path = GENERATED_DIR / "submissions.json"
    if not path.exists():
        raise FileNotFoundError(
            "data/generated/submissions.json is missing. Run: python data/generator.py"
        )
    return json.loads(path.read_text())


@lru_cache(maxsize=1)
def schemes() -> dict[str, Any]:
    return json.loads((DATA_DIR / "marking_schemes.json").read_text())


@lru_cache(maxsize=1)
def taxonomy() -> dict[str, Any]:
    return json.loads((DATA_DIR / "taxonomy.json").read_text())


def get_courses() -> list[dict[str, Any]]:
    data = _submissions_file()
    return [{
        "id": data["cohort_id"],
        "name": data["cohort_label"],
        "term": "2026 Term 3",
        "enrolled": len(data["learners"]),
    }]


def get_assignments(course_id: str) -> list[dict[str, Any]]:
    data = _submissions_file()
    if course_id != data["cohort_id"]:
        return []
    out = []
    for scheme in schemes()["assessments"]:
        aid = scheme["assessment_id"]
        subs = [s for s in data["submissions"] if s["assessment_id"] == aid]
        out.append({
            "id": aid,
            "course_id": course_id,
            "name": f"Assessment {aid[1:]} - Foundational Mathematics",
            "points_possible": sum(q["max_marks"] for q in scheme["questions"]),
            "question_count": len(scheme["questions"]),
            "submission_count": len({s["learner_id"] for s in subs}),
            "expected_count": len(data["learners"]),
            "topics": scheme["topic_coverage"],
            "due_at": f"2026-0{aid[1]}-12T17:00:00Z",
        })
    return out


def get_submissions(assessment_id: str) -> list[dict[str, Any]]:
    data = _submissions_file()
    return [s for s in data["submissions"] if s["assessment_id"] == assessment_id]


def get_roster() -> list[dict[str, Any]]:
    return _submissions_file()["learners"]


def get_cohort_meta() -> dict[str, Any]:
    data = _submissions_file()
    return {
        "cohort_id": data["cohort_id"],
        "cohort_label": data["cohort_label"],
        "assessments_expected": data["assessments_expected"],
        "learners": data["learners"],
    }


def get_question(question_id: str) -> dict[str, Any] | None:
    for scheme in schemes()["assessments"]:
        for q in scheme["questions"]:
            if q["question_id"] == question_id:
                return q
    return None


def get_assessment_questions(assessment_id: str) -> list[dict[str, Any]]:
    for scheme in schemes()["assessments"]:
        if scheme["assessment_id"] == assessment_id:
            return scheme["questions"]
    return []


def post_feedback(assessment_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Writes to an in-memory outbox. A real connector would PUT the grade."""
    entry = {"assessment_id": assessment_id, **payload}
    _FEEDBACK_OUTBOX.append(entry)
    return {"accepted": True, "queued": len(_FEEDBACK_OUTBOX)}


def feedback_outbox() -> list[dict[str, Any]]:
    return list(_FEEDBACK_OUTBOX)
