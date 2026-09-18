"""Rows in sent_emails and the student contact table.

The sent row is the record of what was said and what actually happened to it, so
a 'saved' or 'failed' email is kept beside a 'delivered' one, each labelled.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from backend import db

STUDENT = "student"
TEST_COPY = "test_copy"
_BLOCKS_RESEND = ("delivered", "saved")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _rows(sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    with db.connect() as conn:
        return [dict(r) for r in conn.execute(sql, params).fetchall()]


def add_sent(batch_id: str, learner_id: str, kind: str, to_address: str, subject: str,
             body: str, status: str, reason: str) -> int:
    with db.connect() as conn:
        cur = conn.execute(
            "INSERT INTO sent_emails (batch_id, learner_id, kind, to_address, subject, body, "
            "status, reason, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
            (batch_id, learner_id, kind, to_address, subject, body, status, reason, _now()))
        return int(cur.lastrowid)


def already_sent(batch_id: str, learner_id: str) -> bool:
    marks = ",".join("?" for _ in _BLOCKS_RESEND)
    return bool(_rows(
        f"SELECT 1 FROM sent_emails WHERE batch_id=? AND learner_id=? AND kind=? "
        f"AND status IN ({marks}) LIMIT 1", (batch_id, learner_id, STUDENT, *_BLOCKS_RESEND)))


def list_sent(batch_id: str | None = None) -> list[dict[str, Any]]:
    """Newest first, each with the student's name where the row is about a student."""
    where, params = ("WHERE e.batch_id=?", (batch_id,)) if batch_id else ("", ())
    return _rows(
        "SELECT e.email_id, e.batch_id, e.learner_id, COALESCE(s.name, '') AS name, e.kind, "
        "e.to_address, e.subject, e.body, e.status, e.reason, e.created_at "
        f"FROM sent_emails e LEFT JOIN students s ON s.learner_id = e.learner_id {where} "
        "ORDER BY e.email_id DESC", params)


def list_students(class_id: str | None = None) -> list[dict[str, Any]]:
    where, params = ("WHERE class_id=?", (class_id,)) if class_id else ("", ())
    return _rows("SELECT learner_id, class_id, name, email, origin FROM students "
                 f"{where} ORDER BY class_id, learner_id", params)


def get_student(learner_id: str) -> dict[str, Any] | None:
    rows = _rows("SELECT learner_id, class_id, name, email, origin FROM students "
                 "WHERE learner_id=?", (learner_id,))
    return rows[0] if rows else None


def set_email(learner_id: str, email: str) -> dict[str, Any] | None:
    with db.connect() as conn:
        conn.execute("UPDATE students SET email=? WHERE learner_id=?", (email, learner_id))
    return get_student(learner_id)
