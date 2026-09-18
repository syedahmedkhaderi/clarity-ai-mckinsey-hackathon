"""SQLite persistence. sqlite3 stdlib only, no ORM.

Holds the batch results, the per-learner error profile that gives LOOP memory
across assessments, escalations and facilitator overrides.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from backend.config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS batches (
    batch_id       TEXT PRIMARY KEY,
    assessment_id  TEXT NOT NULL,
    cohort_id      TEXT NOT NULL,
    minutes        INTEGER NOT NULL,
    status         TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    state_json     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS error_profile (
    learner_id     TEXT NOT NULL,
    assessment_id  TEXT NOT NULL,
    question_id    TEXT NOT NULL,
    taxonomy_node  TEXT NOT NULL,
    error_class    TEXT NOT NULL,
    confidence     REAL NOT NULL,
    evidence_span  TEXT,
    reasoning      TEXT,
    language_flag  INTEGER NOT NULL DEFAULT 0,
    batch_id       TEXT NOT NULL,
    PRIMARY KEY (learner_id, assessment_id, question_id)
);

CREATE TABLE IF NOT EXISTS marks (
    learner_id     TEXT NOT NULL,
    assessment_id  TEXT NOT NULL,
    question_id    TEXT NOT NULL,
    awarded        REAL NOT NULL,
    max_marks      REAL NOT NULL,
    confidence     REAL NOT NULL,
    provisional    INTEGER NOT NULL DEFAULT 1,
    batch_id       TEXT NOT NULL,
    PRIMARY KEY (learner_id, assessment_id, question_id)
);

CREATE TABLE IF NOT EXISTS overrides (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id       TEXT NOT NULL,
    type           TEXT NOT NULL,
    target_id      TEXT NOT NULL,
    new_value      TEXT,
    reason         TEXT,
    created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_profile_learner ON error_profile (learner_id);
CREATE INDEX IF NOT EXISTS idx_marks_learner ON marks (learner_id);
"""


def connect(path: Path | None = None) -> sqlite3.Connection:
    conn = sqlite3.connect(path or DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(path: Path | None = None) -> None:
    with connect(path) as conn:
        conn.executescript(SCHEMA)


def save_batch(state: dict[str, Any], created_at: str) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO batches VALUES (?,?,?,?,?,?,?)",
            (state["batch_id"], state["assessment_id"], state["cohort_id"],
             state["facilitator_minutes"], state.get("status", "complete"),
             created_at, json.dumps(state)),
        )


def load_batch(batch_id: str) -> dict[str, Any] | None:
    with connect() as conn:
        row = conn.execute("SELECT state_json FROM batches WHERE batch_id=?", (batch_id,)).fetchone()
    return json.loads(row["state_json"]) if row else None


def list_batches() -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT batch_id, assessment_id, cohort_id, minutes, status, created_at "
            "FROM batches ORDER BY created_at DESC"
        ).fetchall()
    return [dict(r) for r in rows]


def record_diagnoses(batch_id: str, assessment_id: str, diagnoses: list[dict[str, Any]]) -> None:
    rows = [
        (d["learner_id"], assessment_id, d["question_id"], d["taxonomy_node"],
         d.get("error_class", "unclassified"), d.get("confidence", 0.0),
         d.get("evidence_span", ""), d.get("reasoning", ""),
         int(bool(d.get("language_flag"))), batch_id)
        for d in diagnoses if d.get("taxonomy_node")
    ]
    with connect() as conn:
        conn.executemany("INSERT OR REPLACE INTO error_profile VALUES (?,?,?,?,?,?,?,?,?,?)", rows)


def record_marks(batch_id: str, assessment_id: str, marks: list[dict[str, Any]]) -> None:
    rows = [
        (m["learner_id"], assessment_id, m["question_id"], m["awarded"], m["max_marks"],
         m["confidence"], int(bool(m.get("provisional", True))), batch_id)
        for m in marks
    ]
    with connect() as conn:
        conn.executemany("INSERT OR REPLACE INTO marks VALUES (?,?,?,?,?,?,?,?)", rows)


def learner_history(learner_id: str, before_assessment: str | None = None) -> list[dict[str, Any]]:
    """Prior diagnosed nodes for a learner, optionally excluding the current run."""
    sql = "SELECT * FROM error_profile WHERE learner_id=?"
    args: list[Any] = [learner_id]
    if before_assessment:
        sql += " AND assessment_id < ?"
        args.append(before_assessment)
    with connect() as conn:
        return [dict(r) for r in conn.execute(sql + " ORDER BY assessment_id", args).fetchall()]


def full_profile(learner_id: str) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM error_profile WHERE learner_id=? ORDER BY assessment_id, question_id",
            (learner_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def approve_marks(batch_id: str, question_keys: list[tuple[str, str]]) -> int:
    with connect() as conn:
        cur = conn.executemany(
            "UPDATE marks SET provisional=0 WHERE batch_id=? AND learner_id=? AND question_id=?",
            [(batch_id, lid, qid) for lid, qid in question_keys],
        )
        return cur.rowcount


def record_override(batch_id: str, override: dict[str, Any]) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO overrides (batch_id, type, target_id, new_value, reason, created_at) "
            "VALUES (?,?,?,?,?,?)",
            (batch_id, override["type"], override["target_id"], override.get("new_value"),
             override.get("reason", ""), override.get("created_at", "")),
        )


def batch_overrides(batch_id: str) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT type, target_id, new_value, reason, created_at FROM overrides "
            "WHERE batch_id=? ORDER BY id", (batch_id,)
        ).fetchall()
    return [dict(r) for r in rows]
