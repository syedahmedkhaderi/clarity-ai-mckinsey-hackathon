"""Read side of the uploaded data, shared by the LMS connector and the services.

Nothing here is cached. A teacher can upload or delete a test between two
requests, and a stale answer would show a test that no longer exists. Reads
degrade to empty when the tables have not been created yet, because the LMS
connector is called from paths that never ran init_db (the offline evaluator and
several tests).
"""

from __future__ import annotations

import json
import sqlite3
from typing import Any

from backend import db


def _rows(sql: str, args: tuple[Any, ...] = ()) -> list[sqlite3.Row]:
    try:
        with db.connect() as conn:
            return conn.execute(sql, args).fetchall()
    except sqlite3.OperationalError:
        return []


def list_classes() -> list[dict[str, Any]]:
    """Uploaded classes only. The demo class C1 is owned by the mock LMS."""
    rows = _rows(
        "SELECT c.class_id, c.name, "
        "(SELECT COUNT(*) FROM students s WHERE s.class_id = c.class_id) AS enrolled "
        "FROM classes c ORDER BY c.class_id")
    return [dict(r) for r in rows]


def _test_from_row(row: sqlite3.Row) -> dict[str, Any]:
    """The scheme-shaped spec, with the table columns laid over it so the columns
    stay authoritative for name and class."""
    spec = json.loads(row["spec_json"])
    spec.update(assessment_id=row["assessment_id"], class_id=row["class_id"],
                name=row["name"], seq=row["seq"], due_at=row["due_at"],
                created_at=row["created_at"])
    return spec


def list_tests() -> list[dict[str, Any]]:
    rows = _rows("SELECT * FROM uploaded_tests ORDER BY seq, assessment_id")
    return [_test_from_row(r) for r in rows]


def get_test(assessment_id: str) -> dict[str, Any] | None:
    rows = _rows("SELECT * FROM uploaded_tests WHERE assessment_id=?", (assessment_id,))
    return _test_from_row(rows[0]) if rows else None


def class_learners(class_id: str) -> list[dict[str, str]]:
    rows = _rows("SELECT learner_id, name FROM students WHERE class_id=? ORDER BY learner_id",
                 (class_id,))
    return [dict(r) for r in rows]


def list_answers(assessment_id: str) -> list[dict[str, Any]]:
    """Answers as Submission-shaped dicts, in learner then question order."""
    test = get_test(assessment_id)
    if test is None:
        return []
    questions = {q["question_id"]: q for q in test.get("questions", [])}
    order = {qid: i for i, qid in enumerate(questions)}
    names = {l["learner_id"]: l["name"] for l in class_learners(test["class_id"])}
    rows = _rows("SELECT learner_id, question_id, answer, selected_option, submitted_at "
                 "FROM uploaded_answers WHERE assessment_id=?", (assessment_id,))
    out = []
    for r in rows:
        q = questions.get(r["question_id"], {})
        out.append({
            "submission_id": f"{assessment_id}-{r['learner_id']}-{r['question_id']}",
            "learner_id": r["learner_id"],
            "learner_name": names.get(r["learner_id"], r["learner_id"]),
            "assessment_id": assessment_id,
            "question_id": r["question_id"],
            "topic": q.get("topic", ""),
            "type": q.get("type", "written"),
            "answer": r["answer"],
            "selected_option": r["selected_option"],
            "submitted_at": r["submitted_at"],
        })
    out.sort(key=lambda s: (s["learner_id"], order.get(s["question_id"], len(order)),
                            s["question_id"]))
    return out
