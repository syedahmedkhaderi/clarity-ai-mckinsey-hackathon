"""Write side of the uploaded data: classes, students, tests and their answers.

Ids are always made here, never taken from the client: classes C02, C03, tests
U01 to U99, questions U01Q01 and students C02-S01. They are zero-padded so the
plain string comparison in db.learner_history still puts an older test before a
newer one.
"""

from __future__ import annotations

import json
import re
import sqlite3
from datetime import datetime, timezone
from typing import Any

from backend import db
from backend.uploads import registry
from backend.uploads.parse_paper import Paper, Question, resolve_choice
from backend.uploads.parse_sheets import Sheet

CLASS_ID_PATTERN = r"^C(\d+)$"
# Tables that hold results for a test. delete_test purges each of them.
_RESULT_TABLES = ("uploaded_answers", "marks", "error_profile", "batches")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def question_id(assessment_id: str, number: int) -> str:
    return f"{assessment_id}Q{number:02d}"


def question_spec(assessment_id: str, question: Question) -> dict[str, Any]:
    """One question in the shape of data/marking_schemes.json, marked as uploaded.

    The origin key is what keeps the rule engine's demo rules away from it. A
    multiple-choice question carries an empty distractor map, because a teacher
    does not author one, so its wrong answers go to the model rather than to a
    lookup that would find nothing.
    """
    spec: dict[str, Any] = {
        "question_id": question_id(assessment_id, question.number), "number": question.number,
        "topic": question.topic, "type": question.type, "max_marks": question.marks,
        "prompt": question.prompt,
    }
    if question.type == "mcq":
        spec.update(options=question.options, correct=question.correct, distractor_map={},
                    model_answer=question.model_answer)
    else:
        spec.update(model_answer=question.model_answer, scheme=question.scheme)
    spec["origin"] = "uploaded"
    return spec


# --- lookups ------------------------------------------------------------------

def _one(sql: str, args: tuple[Any, ...] = ()) -> sqlite3.Row | None:
    with db.connect() as conn:
        return conn.execute(sql, args).fetchone()


def class_exists(class_id: str) -> bool:
    return _one("SELECT 1 FROM classes WHERE class_id=?", (class_id,)) is not None


def find_class_by_name(name: str) -> str | None:
    row = _one("SELECT class_id FROM classes WHERE lower(name)=lower(?) ORDER BY class_id",
               (name.strip(),))
    return row["class_id"] if row else None


def find_test(class_id: str, name: str) -> str | None:
    row = _one("SELECT assessment_id FROM uploaded_tests WHERE class_id=? AND lower(name)=lower(?)"
               " ORDER BY seq", (class_id, name.strip()))
    return row["assessment_id"] if row else None


def existing_refs(class_id: str) -> dict[str, str]:
    """Students already in a class, as {lowercased sheet id: learner_id}."""
    with db.connect() as conn:
        rows = conn.execute("SELECT learner_id, ref FROM students WHERE class_id=? "
                            "AND origin='uploaded'", (class_id,)).fetchall()
    return {r["ref"].strip().lower(): r["learner_id"] for r in rows}


def test_count() -> int:
    row = _one("SELECT COUNT(*) AS n FROM uploaded_tests")
    return int(row["n"]) if row else 0


def test_rows() -> list[dict[str, Any]]:
    """The summary row for each uploaded test, oldest first."""
    with db.connect() as conn:
        counts = {r["assessment_id"]: r["n"] for r in conn.execute(
            "SELECT assessment_id, COUNT(DISTINCT learner_id) AS n FROM uploaded_answers "
            "GROUP BY assessment_id")}
    return [{"assessment_id": t["assessment_id"], "class_id": t["class_id"], "name": t["name"],
             "due_at": t["due_at"], "question_count": len(t.get("questions", [])),
             "student_count": counts.get(t["assessment_id"], 0), "created_at": t["created_at"]}
            for t in registry.list_tests()]


# --- create ---------------------------------------------------------------------

def _next_number(values: list[str], pattern: str) -> int:
    found = [int(m.group(1)) for v in values if (m := re.search(pattern, v))]
    return max(found, default=0) + 1


def _resolve_class(conn: sqlite3.Connection, class_id: str | None, class_name: str | None,
                   stamp: str) -> str:
    if class_id:
        return class_id
    name = (class_name or "").strip()
    row = conn.execute("SELECT class_id FROM classes WHERE lower(name)=lower(?) "
                       "ORDER BY class_id", (name,)).fetchone()
    if row:
        return row["class_id"]
    ids = [r["class_id"] for r in conn.execute("SELECT class_id FROM classes")]
    # C1 is the demo class, so uploaded classes start at C02.
    number = max(_next_number(ids, CLASS_ID_PATTERN), 2)
    new_id = f"C{number:02d}"
    conn.execute("INSERT INTO classes VALUES (?,?,?)", (new_id, name, stamp))
    return new_id


def _upsert_students(conn: sqlite3.Connection, class_id: str, sheets: list[Sheet]) -> list[str]:
    """Learner ids in the order of the sheets. A student already in the class (same
    sheet id) keeps their id and any email a teacher has set."""
    rows = conn.execute("SELECT learner_id, ref, email FROM students WHERE class_id=?",
                        (class_id,)).fetchall()
    by_ref = {r["ref"].strip().lower(): r for r in rows}
    seq = _next_number([r["learner_id"] for r in rows], r"-S(\d+)$")
    learner_ids: list[str] = []
    for sheet in sheets:
        known = by_ref.get(sheet.ref.strip().lower())
        if known:
            conn.execute("UPDATE students SET name=?, email=? WHERE learner_id=?",
                         (sheet.name, known["email"] or sheet.email, known["learner_id"]))
            learner_ids.append(known["learner_id"])
            continue
        learner_id = f"{class_id}-S{seq:02d}"
        seq += 1
        conn.execute("INSERT INTO students (learner_id, class_id, ref, name, email, origin) "
                     "VALUES (?,?,?,?,?,?)",
                     (learner_id, class_id, sheet.ref, sheet.name, sheet.email, "uploaded"))
        learner_ids.append(learner_id)
    return learner_ids


def create_test(paper: Paper, sheets: list[Sheet], *, title: str, class_id: str | None,
                class_name: str | None, files: list[dict[str, str]]) -> dict[str, str]:
    """Stores a validated upload in one transaction and returns its ids.

    Nothing is written unless everything is, so a failure part-way cannot leave
    a class with students and no test.
    """
    stamp = now_iso()
    with db.connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        class_id = _resolve_class(conn, class_id, class_name, stamp)
        seq = conn.execute("SELECT COALESCE(MAX(seq), 0) AS n FROM uploaded_tests").fetchone()["n"] + 1
        aid = f"U{seq:02d}"
        learner_ids = _upsert_students(conn, class_id, sheets)
        spec = {"assessment_id": aid, "class_id": class_id, "name": title,
                "topic_coverage": sorted({q.topic for q in paper.questions if q.topic}),
                "questions": [question_spec(aid, q) for q in paper.questions]}
        conn.execute("INSERT INTO uploaded_tests VALUES (?,?,?,?,?,?,?,?)",
                     (aid, class_id, seq, title, f"{stamp[:10]}T17:00:00Z", stamp,
                      json.dumps(spec), json.dumps(files)))
        conn.executemany(
            "INSERT INTO uploaded_answers VALUES (?,?,?,?,?,?)",
            [(aid, learner_id, question_id(aid, q.number), *_stored_answer(q, sheet), stamp)
             for sheet, learner_id in zip(sheets, learner_ids) for q in paper.questions])
    return {"assessment_id": aid, "class_id": class_id, "name": title}


def _stored_answer(question: Question, sheet: Sheet) -> tuple[str, str | None]:
    """The answer as the demo data stores it: option text plus the chosen letter for
    multiple choice, the learner's own words for written work."""
    text, letter, _ = resolve_choice(question, sheet.answers.get(question.number, ""))
    return text, letter


# --- delete ---------------------------------------------------------------------

def delete_test(assessment_id: str) -> bool:
    """Removes an uploaded test and everything that was produced from it.

    Students stay, because they belong to the class and may sit later tests. Sent
    emails stay too: they are a record of what was actually sent to someone.
    """
    with db.connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        if not conn.execute("SELECT 1 FROM uploaded_tests WHERE assessment_id=?",
                            (assessment_id,)).fetchone():
            return False
        conn.execute("DELETE FROM overrides WHERE batch_id IN "
                     "(SELECT batch_id FROM batches WHERE assessment_id=?)", (assessment_id,))
        for table in _RESULT_TABLES:
            conn.execute(f"DELETE FROM {table} WHERE assessment_id=?", (assessment_id,))
        conn.execute("DELETE FROM uploaded_tests WHERE assessment_id=?", (assessment_id,))
    return True
