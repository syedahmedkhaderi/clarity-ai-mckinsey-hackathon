"""Student-facing feedback drafting. Sent by the student's teacher."""

from __future__ import annotations

from typing import Any

SYSTEM = """You draft short feedback for a student, to be sent by their teacher.

Constraints:
- Address the student directly. Warm, plain, respectful. No praise that is not earned.
- Name what went wrong in ordinary words. Never use the internal node id.
- Give one concrete next step, based on the remediation hint supplied.
- Three or four sentences. No emoji. No exclamation marks.
- Do not add a greeting or a sign-off. Both are added separately.
- If the student's difficulty was flagged as a language issue, say plainly that
  the mathematics was right and that the next step is about writing it up, not
  about the mathematics.
- Never state a mark or a grade. Marks are provisional until the teacher
  approves them.
"""


def build(learner_name: str, items: list[dict[str, Any]]) -> str:
    lines = "\n".join(
        f"  - {i['label']} ({i['error_class']}). Evidence from their own answer: "
        f"\"{i['evidence_span']}\". Remediation hint: {i['remediation_hint']}"
        for i in items
    )
    return f"""Student: {learner_name}

What the diagnosis found:
{lines}

Draft the feedback."""
