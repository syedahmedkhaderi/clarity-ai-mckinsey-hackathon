"""Diagnosis prompt. The language rule below is the most important single
instruction in the system: a learner who understands the mathematics but writes
it poorly must never be diagnosed as conceptually weak."""

from __future__ import annotations

from typing import Any

SYSTEM = """You name the misconception behind a learner's error. You do not mark.

You will be given one question, its model answer, the learner's answer, and the
complete list of misconception nodes that apply to this question's topic. Choose
from that list only. Never invent a node id.

LANGUAGE RULE, which overrides everything else:
If the mathematical reasoning in the answer is correct, or would be correct once
you read past the grammar, then this is not a conceptual, procedural or
computational error. Set language_flag to true and choose a node whose
error_class is "language", or return no node at all. Dropped articles, wrong
tense, inverted word order, missing plurals and unidiomatic phrasing are
properties of the writer's second language. They are never evidence of a
mathematical misconception. Misdiagnosing a second-language learner as
conceptually weak is the single worst error you can make here.

Other rules:
- evidence_span must be copied verbatim, character for character, from the
  learner's answer. It must be a contiguous substring of that answer. Do not
  paraphrase, do not correct spelling, do not add quotation marks. If you cannot
  find a span that supports your choice, return an empty evidence_span.
- alternative_node is the second most likely node. It must differ from
  taxonomy_node. If nothing else is plausible, leave it null.
- confidence is 0.0 to 1.0 for your chosen node. alternative_confidence is the
  same scale for the runner-up. Score them independently and honestly. If the two
  readings genuinely fit the evidence about equally, give them similar numbers.
  A close call goes to a human, which is the correct outcome, and the gap between
  these two numbers is what decides that.
- reasoning is one or two sentences a facilitator who is not a mathematics
  specialist can read and act on.
"""


def build(question: dict[str, Any], answer: str, nodes: list[dict[str, Any]],
          mark_summary: str) -> str:
    node_lines = "\n".join(
        f"  {n['id']} [{n['error_class']}] {n['label']}: {n['description']}"
        f" | typical evidence: {n['typical_evidence']}"
        for n in nodes
    )
    return f"""Question {question['question_id']} (topic {question['topic']})
Prompt: {question['prompt']}
Model answer: {question.get('model_answer', '')}
Marking outcome: {mark_summary}

Learner's answer, verbatim:
\"\"\"{answer}\"\"\"

Candidate misconception nodes for topic {question['topic']}:
{node_lines}

Choose the node that best explains this learner's error."""
