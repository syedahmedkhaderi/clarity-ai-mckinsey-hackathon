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
from backend.agents.offline_rules import diagnose_mcq, diagnose_offline
from backend.lms import mock_api
from backend.models import Diagnosis, Mark
from backend.prompts import diagnosis as diagnosis_prompt
from backend.state import LoopState, trace

AGENT = "diagnostician"


class _DiagnosisOut(BaseModel):
    taxonomy_node: str | None = None
    alternative_node: str | None = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    evidence_span: str = ""
    reasoning: str = ""
    language_flag: bool = False


def run(state: LoopState) -> LoopState:
    started = time.perf_counter()
    lost = [m for m in state["marks"] if m.awarded < m.max_marks]
    trace(state, AGENT, "start",
          f"{len(lost)} of {len(state['marks'])} responses lost marks and need a diagnosis")

    subs = {(s.learner_id, s.question_id): s for s in state["submissions"]}
    diagnoses: list[Diagnosis] = []
    model_calls = 0
    rejected_spans = 0

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
        d, used_model, span_ok = _diagnose_written(question, sub, mark)
        model_calls += int(used_model)
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
    state["all_diagnoses"] = diagnoses  # type: ignore[typeddict-unknown-key]
    trace(state, AGENT, "end",
          f"{len(survivors)} diagnoses passed the reviewer gate, "
          f"{len(diagnoses) - len(survivors)} escalated to a human",
          duration_ms=_ms(started), level="decision")
    return state


def _diagnose_written(question: dict[str, Any], sub: Any,
                      mark: Mark) -> tuple[Diagnosis, bool, bool]:
    nodes = [n for n in mock_api.taxonomy()["nodes"] if n["topic"] == question["topic"]]
    valid_ids = {n["id"] for n in nodes}
    summary = (f"awarded {mark.awarded} of {mark.max_marks}, "
               f"criteria missed: {'; '.join(mark.criteria_missed) or 'none'}")
    out = llm.call(diagnosis_prompt.SYSTEM,
                   diagnosis_prompt.build(question, sub.answer, nodes, summary),
                   _DiagnosisOut)
    if out is None:
        return diagnose_offline(question, sub, mark), False, True

    span_ok = bool(out.evidence_span) and out.evidence_span in sub.answer
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
        return fallback, True, span_ok

    meta = next((n for n in nodes if n["id"] == out.taxonomy_node), {})
    return Diagnosis(
        question_id=question["question_id"], learner_id=sub.learner_id,
        taxonomy_node=out.taxonomy_node,
        alternative_node=out.alternative_node if out.alternative_node in valid_ids else None,
        error_class=meta.get("error_class", "unclassified"),
        confidence=out.confidence, evidence_span=out.evidence_span,
        reasoning=out.reasoning, language_flag=out.language_flag or
        meta.get("error_class") == "language",
        source="model", topic=question["topic"],
    ), True, True


def _ms(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)
