"""Diagnostician. Names the misconception behind an error and cites the learner's
own words as evidence.

Only runs on responses that lost marks. MCQ errors are resolved from the
distractor map with no model call at all. Written errors get one model call each,
scoped to the taxonomy nodes for that question's topic so the choice stays
tractable.

Fabricated evidence is the worst failure mode in a demo where a judge can read
the learner's answer on screen, so every evidence span is verified to be a
verbatim substring of the answer before it is allowed through.
"""

from __future__ import annotations

import time
from typing import Any

from pydantic import BaseModel, Field

from backend import llm
from backend.agents import reviewer
from backend.agents.offline_rules import (LANGUAGE_CLASS_NODES, diagnose_mcq,
                                          diagnose_offline, mathematics_is_correct)
from backend.lms import mock_api
from backend.models import Diagnosis, Mark
from backend.prompts import diagnosis as diagnosis_prompt
from backend.state import LoopState, trace

AGENT = "diagnostician"


class _DiagnosisOut(BaseModel):
    taxonomy_node: str | None = None
    alternative_node: str | None = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    alternative_confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    evidence_span: str = ""
    reasoning: str = ""
    language_flag: bool = False


def run(state: LoopState) -> LoopState:
    started = time.perf_counter()
    lost = [m for m in state["marks"] if m.awarded < m.max_marks]
    trace(state, AGENT, "start",
          f"{len(lost)} of {len(state['marks'])} responses lost marks and need a diagnosis "
          f"({llm.describe()})")

    subs = {(s.learner_id, s.question_id): s for s in state["submissions"]}
    diagnoses: list[Diagnosis] = []
    written: list[tuple[dict[str, Any], Any, Mark]] = []

    for mark in lost:
        sub = subs.get((mark.learner_id, mark.question_id))
        question = mock_api.get_question(mark.question_id)
        if sub is None or question is None:
            continue
        if question["type"] == "mcq":
            d = diagnose_mcq(question, sub)
            if d:
                diagnoses.append(d)
            continue
        written.append((question, sub, mark))

    # Each written diagnosis is independent of the others, so they go out
    # together. Serially at a few seconds a call this is the slowest node in the
    # graph by an order of magnitude.
    def progress(done: int, total: int) -> None:
        trace(state, AGENT, "progress",
              f"Named the misconception behind {done} of {total} written errors, "
              f"each with a span quoted from the learner's own answer.")

    def timed_out(missing: int, total: int) -> None:
        trace(state, AGENT, "timeout",
              f"{missing} of {total} diagnosis calls did not return in time. Those errors "
              f"were diagnosed by the deterministic rules instead.", level="warning")

    outputs = llm.call_many(
        diagnosis_prompt.SYSTEM,
        [_build_prompt(q, sub, mark) for q, sub, mark in written],
        _DiagnosisOut, smart=True, on_progress=progress, on_timeout=timed_out,
    ) if llm.available() else [None] * len(written)

    model_calls = sum(1 for o in outputs if o is not None)
    rejected_spans = 0
    for (question, sub, mark), out in zip(written, outputs):
        d, span_ok = _resolve(question, sub, mark, out)
        rejected_spans += int(not span_ok)
        diagnoses.append(d)

    lang = [d for d in diagnoses if d.language_flag]
    trace(state, AGENT, "diagnosed",
          f"{len(diagnoses)} diagnoses. "
          f"{sum(1 for d in diagnoses if d.source == 'distractor_map')} from the distractor map "
          f"with no model call, {model_calls} model calls. "
          f"{len(lang)} flagged as a language barrier rather than a misconception.",
          level="decision")
    if rejected_spans:
        trace(state, AGENT, "evidence_check",
              f"{rejected_spans} model responses cited evidence that was not present in the "
              f"learner's answer. Those were rejected and rediagnosed by rule.", level="warning")

    survivors = reviewer.gate_diagnoses(state, diagnoses)
    state["diagnoses"] = survivors
    state["all_diagnoses"] = diagnoses
    trace(state, AGENT, "end",
          f"{len(survivors)} diagnoses passed the reviewer gate, "
          f"{len(diagnoses) - len(survivors)} escalated to a human",
          duration_ms=_ms(started), level="decision")
    return state


def _topic_nodes(question: dict[str, Any]) -> list[dict[str, Any]]:
    return [n for n in mock_api.taxonomy()["nodes"] if n["topic"] == question["topic"]]


def _build_prompt(question: dict[str, Any], sub: Any, mark: Mark) -> str:
    summary = (f"awarded {mark.awarded} of {mark.max_marks}, "
               f"criteria missed: {'; '.join(mark.criteria_missed) or 'none'}")
    return diagnosis_prompt.build(question, sub.answer, _topic_nodes(question), summary)


def normalise_span(span: str) -> str:
    """Trims whitespace and one layer of wrapping quotes.

    Models often hand back a quotation with the quote marks included. Those marks
    are not part of the learner's answer, so the span would fail the verbatim
    check on punctuation the model added rather than on anything it invented.
    The text inside still has to match exactly.
    """
    span = span.strip()
    for quote in ('"', "'", "\u201c", "\u2018"):
        if span.startswith(quote):
            span = span[1:].strip()
            break
    for quote in ('"', "'", "\u201d", "\u2019"):
        if span.endswith(quote):
            span = span[:-1].strip()
            break
    return span


def _resolve(question: dict[str, Any], sub: Any, mark: Mark,
             out: "_DiagnosisOut | None") -> tuple[Diagnosis, bool]:
    """Turns one model response into a Diagnosis, or falls back to the rules."""
    nodes = _topic_nodes(question)
    valid_ids = {n["id"] for n in nodes}
    if out is None:
        return diagnose_offline(question, sub, mark), True

    span = normalise_span(out.evidence_span)
    span_ok = bool(span) and span in sub.answer
    node_ok = out.taxonomy_node in valid_ids if out.taxonomy_node else True
    if not span_ok or not node_ok:
        fallback = diagnose_offline(question, sub, mark)
        fallback.confidence = min(fallback.confidence, 0.6)
        fallback.reasoning = (
            "The model's evidence could not be found verbatim in the learner's answer, "
            "so its diagnosis was rejected. " + fallback.reasoning
            if not span_ok else
            f"The model proposed a node outside topic {question['topic']}, "
            f"so its diagnosis was rejected. " + fallback.reasoning)
        return fallback, span_ok

    meta = next((n for n in nodes if n["id"] == out.taxonomy_node), {})
    language = out.language_flag or meta.get("error_class") == "language"

    # The language rule, enforced rather than requested. If the learner reached
    # the value the scheme asks for, the mathematics held, so a conceptual,
    # procedural or computational node cannot be the explanation no matter how
    # confident the model is. Observed in practice: a learner whose answer was
    # "Answer is 7/12 km" with broken word order was diagnosed as a procedural
    # misconception at 0.9 confidence. That is the exact failure this product
    # exists to prevent, so it is a check in code, not a line in a prompt.
    if not language and mathematics_is_correct(question, sub.answer):
        language = True
        out.reasoning = (
            "The final value is correct, so the mathematics held. What the marks "
            "were lost on is how the working is written, which is a language "
            "issue rather than a misconception. "
            + (out.reasoning or "")
        ).strip()

    return Diagnosis(
        question_id=question["question_id"], learner_id=sub.learner_id,
        taxonomy_node=out.taxonomy_node,
        alternative_node=out.alternative_node if out.alternative_node in valid_ids else None,
        alternative_confidence=(out.alternative_confidence
                                if out.alternative_node in valid_ids else 0.0),
        error_class=meta.get("error_class", "unclassified"),
        confidence=out.confidence, evidence_span=span,
        reasoning=out.reasoning, language_flag=language,
        source="model", topic=question["topic"],
    ), True


def _ms(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)
