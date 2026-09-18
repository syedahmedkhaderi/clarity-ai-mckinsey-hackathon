"""Mock LMS backed by the generated submissions.

The shape deliberately mirrors a Canvas or Moodle style REST API so the
integration story is a connector swap, not a rewrite:

    GET  /lms/courses                          -> Canvas  GET /api/v1/courses
    GET  /lms/courses/{id}/assignments         -> Canvas  GET /api/v1/courses/:id/assignments
    GET  /lms/assignments/{id}/submissions     -> Canvas  GET /api/v1/courses/:cid/assignments/:id/submissions
    POST /lms/assignments/{id}/feedback        -> Canvas  PUT /api/v1/courses/:cid/assignments/:id/submissions/:uid

Moodle equivalents are core_course_get_courses, mod_assign_get_assignments,
mod_assign_get_submissions and mod_assign_save_grade.

Tests a teacher uploads are merged in beside the generated demo class C1, which
always comes first. Demo data is cached; uploaded data is read from sqlite on
every call because it can change between two requests.
"""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

from backend import llm
from backend.config import DATA_DIR, GENERATED_DIR
from backend.uploads import registry

DEMO_TERM = "2026 Term 3"
AI_KEY_REQUIRED_MESSAGE = ("Analysing your own tests needs an AI key. No key is set up, "
                           "so this test cannot be run yet.")

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


class RunRefused(Exception):
    """A run the connector will not start. The API maps it to an HTTP error."""

    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def _demo_ids() -> list[str]:
    return [scheme["assessment_id"] for scheme in schemes()["assessments"]]


def _uploaded_test(assessment_id: str) -> dict[str, Any] | None:
    """The uploaded test for an id, or None for a demo test or an unknown id.

    Read from sqlite on every call. A teacher can add or delete a test between
    two requests, so nothing about uploaded data is cached.
    """
    if assessment_id in _demo_ids():
        return None
    return registry.get_test(assessment_id)


def get_courses() -> list[dict[str, Any]]:
    data = _submissions_file()
    demo = {
        "id": data["cohort_id"],
        "name": data["cohort_label"],
        "term": DEMO_TERM,
        "enrolled": len(data["learners"]),
    }
    uploaded = [
        {"id": c["class_id"], "name": c["name"], "term": "Uploaded", "enrolled": c["enrolled"]}
        for c in registry.list_classes() if c["class_id"] != demo["id"]
    ]
    return [demo, *uploaded]


def _demo_assignment(scheme: dict[str, Any], data: dict[str, Any]) -> dict[str, Any]:
    aid = scheme["assessment_id"]
    subs = [s for s in data["submissions"] if s["assessment_id"] == aid]
    return {
        "id": aid,
        "course_id": data["cohort_id"],
        "name": f"Assessment {aid[1:]} - Foundational Mathematics",
        "display_name": f"Test {aid[1:]}",
        "source": "demo",
        "needs_ai": False,
        "class_id": data["cohort_id"],
        "points_possible": sum(q["max_marks"] for q in scheme["questions"]),
        "question_count": len(scheme["questions"]),
        "submission_count": len({s["learner_id"] for s in subs}),
        "expected_count": len(data["learners"]),
        "topics": scheme["topic_coverage"],
        "due_at": f"2026-0{aid[1]}-12T17:00:00Z",
    }


def _uploaded_assignment(test: dict[str, Any]) -> dict[str, Any]:
    aid, class_id = test["assessment_id"], test["class_id"]
    submitted = {s["learner_id"] for s in registry.list_answers(aid)}
    return {
        "id": aid,
        "course_id": class_id,
        "name": test["name"],
        "display_name": test["name"],
        "source": "uploaded",
        "needs_ai": True,
        "class_id": class_id,
        "points_possible": sum(q["max_marks"] for q in test["questions"]),
        "question_count": len(test["questions"]),
        "submission_count": len(submitted),
        "expected_count": len(registry.class_learners(class_id)),
        "topics": test.get("topic_coverage") or [],
        "due_at": test.get("due_at", ""),
    }


def get_assignments(course_id: str) -> list[dict[str, Any]]:
    data = _submissions_file()
    out = []
    if course_id == data["cohort_id"]:
        out.extend(_demo_assignment(scheme, data) for scheme in schemes()["assessments"])
    out.extend(_uploaded_assignment(t) for t in registry.list_tests()
               if t["class_id"] == course_id)
    return out


def get_submissions(assessment_id: str) -> list[dict[str, Any]]:
    if assessment_id not in _demo_ids():
        return registry.list_answers(assessment_id)
    data = _submissions_file()
    return [s for s in data["submissions"] if s["assessment_id"] == assessment_id]


def get_roster(class_id: str | None = None) -> list[dict[str, Any]]:
    """The demo class for C1, an uploaded class by id, or everyone for None.

    None returns the demo roster first, then every uploaded student, so a lookup
    of a learner's name works whichever class they are in.
    """
    demo = _submissions_file()["learners"]
    if class_id == _submissions_file()["cohort_id"]:
        return demo
    if class_id is not None:
        return registry.class_learners(class_id)
    uploaded = [l for c in registry.list_classes()
                for l in registry.class_learners(c["class_id"])]
    return [*demo, *uploaded]


def assessments_in_class(class_id: str) -> list[str]:
    if class_id == _submissions_file()["cohort_id"]:
        return _demo_ids()
    return [t["assessment_id"] for t in registry.list_tests() if t["class_id"] == class_id]


def cohort_id_for(assessment_id: str) -> str:
    """The class an assessment belongs to. An unknown id falls back to the demo
    class, which is what a run of an unknown id has always done."""
    test = _uploaded_test(assessment_id)
    return test["class_id"] if test else _submissions_file()["cohort_id"]


def get_cohort_meta(assessment_id: str | None = None) -> dict[str, Any]:
    """The demo class for None or a demo test, otherwise the test's own class."""
    test = _uploaded_test(assessment_id) if assessment_id else None
    if test is None:
        data = _submissions_file()
        return {
            "cohort_id": data["cohort_id"],
            "cohort_label": data["cohort_label"],
            "assessments_expected": data["assessments_expected"],
            "learners": data["learners"],
        }
    class_id = test["class_id"]
    label = next((c["name"] for c in registry.list_classes() if c["class_id"] == class_id),
                 class_id)
    return {
        "cohort_id": class_id,
        "cohort_label": label,
        "assessments_expected": assessments_in_class(class_id),
        "learners": registry.class_learners(class_id),
    }


def resolve_run(assessment_id: str, cohort_id: str) -> str:
    """Decides which class a run belongs to, or refuses it.

    A demo test passes through unchanged. An uploaded test needs the model: the
    rule engine only knows the demo questions, so running it without a key would
    mark the teacher's own test with rules written for someone else's.
    """
    test = _uploaded_test(assessment_id)
    if test is None:
        return cohort_id
    if not llm.available():
        raise RunRefused(409, "AI_KEY_REQUIRED", AI_KEY_REQUIRED_MESSAGE)
    return test["class_id"]


def get_question(question_id: str) -> dict[str, Any] | None:
    for scheme in schemes()["assessments"]:
        for q in scheme["questions"]:
            if q["question_id"] == question_id:
                return q
    test = registry.get_test(question_id.partition("Q")[0])
    if test is None:
        return None
    return next((q for q in test["questions"] if q["question_id"] == question_id), None)


def get_assessment_questions(assessment_id: str) -> list[dict[str, Any]]:
    for scheme in schemes()["assessments"]:
        if scheme["assessment_id"] == assessment_id:
            return scheme["questions"]
    test = registry.get_test(assessment_id)
    return test["questions"] if test else []


def post_feedback(assessment_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Writes to an in-memory outbox. A real connector would PUT the grade."""
    entry = {"assessment_id": assessment_id, **payload}
    _FEEDBACK_OUTBOX.append(entry)
    return {"accepted": True, "queued": len(_FEEDBACK_OUTBOX)}


def feedback_outbox() -> list[dict[str, Any]]:
    return list(_FEEDBACK_OUTBOX)
