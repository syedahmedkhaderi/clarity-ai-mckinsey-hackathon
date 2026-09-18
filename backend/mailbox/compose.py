"""Builds the draft email for one student from a finished batch.

Composed in code, with no model call, so the same batch always gives the same
draft and the wording a teacher reviews is the wording that was tested. The
model's part is the drafted feedback body the planner already wrote.
"""

from __future__ import annotations

import re
from typing import Any

from backend.lms import mock_api
from backend.mailbox import guard

SIGN_OFF = "Best wishes,\nYour teacher"
# Shown instead of a pattern label when the difficulty was flagged as wording,
# so the email never tells a student who understood the mathematics that they
# did not (AGENTS.md invariant 6).
WORDING_PATTERN = "the wording, not the mathematics"
NO_BODY_FALLBACK = "It is worth going back over these before the next test."

_QUESTION_NUMBER = re.compile(r"Q(\d+)$")


def test_name(assessment_id: str) -> str:
    """The name the teacher sees for a test, such as 'Test 3' or an uploaded title."""
    try:
        rows = mock_api.get_assignments(mock_api.cohort_id_for(assessment_id))
    except Exception:
        rows = []
    for row in rows:
        if row.get("id") == assessment_id and row.get("display_name"):
            return str(row["display_name"])
    return f"Test {assessment_id[1:].lstrip('0') or assessment_id}"


def question_number(question_id: str) -> int:
    match = _QUESTION_NUMBER.search(question_id)
    return int(match.group(1)) if match else 0


def _topic_labels() -> dict[str, str]:
    return {t["id"]: t["label"] for t in mock_api.taxonomy()["topics"]}


def _node_labels() -> dict[str, str]:
    return {n["id"]: n["label"] for n in mock_api.taxonomy()["nodes"]}


def observations(batch: dict[str, Any], learner_id: str) -> list[dict[str, Any]]:
    """One row per diagnosed answer, in question order. Labels only, never node ids."""
    topics, nodes = _topic_labels(), _node_labels()
    test = test_name(batch.get("assessment_id", ""))
    rows = []
    for d in batch.get("diagnoses") or []:
        if d.get("learner_id") != learner_id or not d.get("taxonomy_node"):
            continue
        wording = d.get("language_flag") or d.get("error_class") == "language"
        rows.append({
            "test": test,
            "question_number": question_number(d["question_id"]),
            "area": topics.get(d.get("topic", ""), "") or "this topic",
            "pattern": WORDING_PATTERN if wording
            else nodes.get(d["taxonomy_node"], "a mistake pattern"),
        })
    return sorted(rows, key=lambda r: r["question_number"])


def evidence_spans(batch: dict[str, Any], learner_id: str) -> list[str]:
    """The student's own words the feedback quotes. The guard lets these through."""
    return [d["evidence_span"] for d in batch.get("diagnoses") or []
            if d.get("learner_id") == learner_id and d.get("evidence_span")]


def _strip_address(body: str, name: str) -> str:
    """Drops a leading greeting or name, since the email opens with its own."""
    first = re.escape(name.split()[0]) if name.split() else ""
    full = re.escape(name)
    pattern = re.compile(rf"^\s*(?:(?:hi|hello|dear)\s+(?:{full}|{first})\s*[,:]\s*|{full}\s*,\s*)",
                         re.IGNORECASE) if first else None
    stripped = pattern.sub("", body, count=1) if pattern else body
    return stripped[:1].upper() + stripped[1:] if stripped else body


def _feedback_body(batch: dict[str, Any], learner_id: str, name: str) -> str:
    """The planner's drafted note, unless it says something the guard would refuse.

    A model can leak a pattern id or a mark despite the prompt. Sending would
    then be refused on text the system wrote itself, so the draft falls back to a
    plain line and the findings list above still carries the substance.
    """
    plan = batch.get("plan") or {}
    body = next((f.get("body", "") for f in plan.get("feedback") or []
                 if f.get("learner_id") == learner_id), "").strip()
    body = _strip_address(body, name).strip()
    try:
        guard.check("", body, batch.get("all_marks") or [], learner_id,
                    evidence_spans(batch, learner_id))
    except guard.GuardError:
        return NO_BODY_FALLBACK
    return body or NO_BODY_FALLBACK


def subject_for(batch: dict[str, Any]) -> str:
    return f"Next steps after {test_name(batch.get('assessment_id', ''))}"


def compose(batch: dict[str, Any], learner_id: str, name: str) -> dict[str, Any] | None:
    """Returns subject, body and observations, or None when there is nothing to say."""
    obs = observations(batch, learner_id)
    if not obs:
        return None
    first_name = name.split()[0] if name else "there"
    where = "\n".join(f"- {o['test']}, Question {o['question_number']}: "
                      f"{o['area']} ({o['pattern']})" for o in obs)
    body = (f"Hi {first_name},\n\n"
            f"Where we saw it\n{where}\n\n"
            f"{_feedback_body(batch, learner_id, name)}\n\n"
            f"{SIGN_OFF}")
    return {"subject": subject_for(batch), "body": body, "observations": obs}
