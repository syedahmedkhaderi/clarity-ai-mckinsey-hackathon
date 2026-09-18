"""Refuses an email that leaks something a student must not be sent.

Two things never leave the building: the internal mistake-pattern ids, which
mean nothing to a student, and that student's marks, which are draft until the
teacher confirms them. This is the same rule the feedback prompt gives the
model, enforced on the final text a teacher may have edited by hand.
"""

from __future__ import annotations

import re
from typing import Any, Iterable

from backend.lms import mock_api

NODE_ID_IN_TEXT = "NODE_ID_IN_TEXT"
MARKS_IN_TEXT = "MARKS_IN_TEXT"


class GuardError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _fmt(value: float) -> str:
    return f"{value:g}"


def mark_strings(all_marks: Iterable[dict[str, Any]], learner_id: str) -> list[tuple[str, str]]:
    """Every (awarded, out-of) pair a mark or the total could be written as."""
    pairs: list[tuple[str, str]] = []
    total_awarded = total_max = 0.0
    for m in all_marks:
        if m.get("learner_id") != learner_id:
            continue
        pairs.append((_fmt(m["awarded"]), _fmt(m["max_marks"])))
        total_awarded += m["awarded"]
        total_max += m["max_marks"]
    if pairs:
        pairs.append((_fmt(total_awarded), _fmt(total_max)))
    return sorted(set(pairs))


def _mark_pattern(awarded: str, out_of: str) -> re.Pattern[str]:
    a, m = re.escape(awarded), re.escape(out_of)
    # Lookarounds stop "12/30" matching the mark "2/3" and "2/3/4" matching too.
    return re.compile(rf"(?<![\d./]){a}(?:\s*/\s*|\s+(?:out\s+)?of\s+){m}(?![\d/])", re.IGNORECASE)


def _node_id_pattern() -> re.Pattern[str]:
    ids = "|".join(re.escape(n["id"]) for n in mock_api.taxonomy()["nodes"])
    return re.compile(rf"\b(?:{ids})\b", re.IGNORECASE)


def _without(text: str, quoted: Iterable[str]) -> str:
    """Blanks the student's own quoted words, so a fraction they wrote is not a mark."""
    for span in sorted({q for q in quoted if q}, key=len, reverse=True):
        text = text.replace(span, " ")
    return text


def check_node_ids(*texts: str) -> None:
    pattern = _node_id_pattern()
    if any(pattern.search(t) for t in texts):
        raise GuardError(
            NODE_ID_IN_TEXT,
            "This note mentions an internal code such as M01. Reword it in plain words "
            "before sending.")


def check_marks(texts: Iterable[str], all_marks: Iterable[dict[str, Any]], learner_id: str,
                quoted: Iterable[str] = ()) -> None:
    patterns = [_mark_pattern(a, m) for a, m in mark_strings(all_marks, learner_id)]
    for text in texts:
        cleaned = _without(text, quoted)
        if any(p.search(cleaned) for p in patterns):
            raise GuardError(
                MARKS_IN_TEXT,
                "This note states a mark. Marks are still a draft until you confirm them, "
                "so take the mark out before sending.")


def check(subject: str, body: str, all_marks: Iterable[dict[str, Any]] | None = None,
          learner_id: str = "", quoted: Iterable[str] = ()) -> None:
    """Raises GuardError. Without a learner only the pattern-id rule applies."""
    check_node_ids(subject, body)
    if learner_id and all_marks is not None:
        check_marks((subject, body), all_marks, learner_id, quoted)
