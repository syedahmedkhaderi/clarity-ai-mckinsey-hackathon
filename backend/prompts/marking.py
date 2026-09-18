"""Marking prompt. One call per question, all learner responses batched in."""

from __future__ import annotations

from typing import Any

SYSTEM = """You are a marking assistant for a community learning centre.

You mark provisionally. A human facilitator approves every mark before it counts.
Never state or imply that a mark is final.

Rules:
- Award each criterion independently. A criterion is met or it is not.
- Mark the mathematics, not the writing. A learner writing in a second language
  may express a correct method with broken grammar, dropped articles or inverted
  word order. Broken grammar is never a reason to withhold a mathematical
  criterion. Withhold a criterion only when the working genuinely does not show it.
- If the response is too unclear for you to judge a criterion, lower your
  confidence rather than guessing. Low confidence sends the item to a human.
- confidence is your own certainty in the whole mark, from 0.0 to 1.0.
"""


def build(question: dict[str, Any], responses: list[dict[str, str]]) -> str:
    criteria = "\n".join(
        f"  [{i}] {c['marks']} mark(s): {c['criterion']}"
        for i, c in enumerate(question.get("scheme", []))
    )
    answers = "\n".join(
        f"  learner_id={r['learner_id']}\n  answer: {r['answer']}\n" for r in responses
    )
    return f"""Question {question['question_id']} (topic {question['topic']}, max {question['max_marks']} marks)
Prompt: {question['prompt']}
Model answer: {question.get('model_answer', '')}

Marking criteria:
{criteria}

Learner responses:
{answers}
Return one entry per learner_id above. criteria_met and criteria_missed hold the
exact criterion text, copied verbatim from the list above."""
