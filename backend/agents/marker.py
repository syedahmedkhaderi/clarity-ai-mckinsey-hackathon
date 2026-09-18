"""Marker. MCQ is deterministic. Written responses go to the model in one call
per question, all learners batched, because live demo latency matters.

Every mark is provisional. Nothing here sets a mark that counts.
"""

from __future__ import annotations

import time
from typing import Any

from pydantic import BaseModel, Field

from backend import llm
from backend.agents import reviewer
from backend.agents.offline_rules import mark_written_offline
from backend.lms import mock_api
from backend.models import Mark
from backend.prompts import marking
from backend.state import LoopState, trace

AGENT = "marker"


class _MarkOut(BaseModel):
    learner_id: str
    awarded: float
    confidence: float = Field(ge=0.0, le=1.0)
    criteria_met: list[str] = Field(default_factory=list)
    criteria_missed: list[str] = Field(default_factory=list)


class _MarkBatch(BaseModel):
    marks: list[_MarkOut]


def run(state: LoopState) -> LoopState:
    started = time.perf_counter()
    mode = "model" if llm.available() else "deterministic rules"
    trace(state, AGENT, "start",
          f"Marking {len(state['submissions'])} responses against the scheme ({mode})")

    by_question: dict[str, list[Any]] = {}
    for sub in state["submissions"]:
        by_question.setdefault(sub.question_id, []).append(sub)

    marks: list[Mark] = []
    llm_calls = 0
    for question_id, subs in sorted(by_question.items()):
        question = mock_api.get_question(question_id)
        if question is None:
            continue
        if question["type"] == "mcq":
            marks.extend(_mark_mcq(question, subs))
        else:
            batch, used_model = _mark_written(question, subs)
            marks.extend(batch)
            llm_calls += int(used_model)

    trace(state, AGENT, "marked",
          f"{len(marks)} provisional marks. "
          f"{sum(1 for m in marks if m.source == 'deterministic')} deterministic, "
          f"{sum(1 for m in marks if m.source == 'model')} from the model, "
          f"{sum(1 for m in marks if m.source == 'fallback')} from the rule fallback. "
          f"{llm_calls} model calls.")

    survivors = reviewer.gate_marks(state, marks)
    dropped = len(marks) - len(survivors)
    state["marks"] = survivors
    state["all_marks"] = marks  # type: ignore[typeddict-unknown-key]
    trace(state, AGENT, "end",
          f"{len(survivors)} marks passed the reviewer gate, {dropped} escalated for human marking",
          duration_ms=_ms(started), level="decision" if dropped else "info")
    return state


def _mark_mcq(question: dict[str, Any], subs: list[Any]) -> list[Mark]:
    """Deterministic. The answer either is the correct option or it is not."""
    out: list[Mark] = []
    correct_text = question["options"][question["correct"]]
    for sub in subs:
        hit = sub.answer.strip() == question["correct"] or sub.answer.strip() == correct_text
        out.append(Mark(
            question_id=question["question_id"], learner_id=sub.learner_id,
            awarded=float(question["max_marks"]) if hit else 0.0,
            max_marks=float(question["max_marks"]), confidence=1.0,
            criteria_met=["Correct option selected"] if hit else [],
            criteria_missed=[] if hit else ["Correct option selected"],
            source="deterministic",
        ))
    return out


def _mark_written(question: dict[str, Any], subs: list[Any]) -> tuple[list[Mark], bool]:
    """One model call for all learners on this question, with a rule fallback."""
    payload = [{"learner_id": s.learner_id, "answer": s.answer} for s in subs]
    result = llm.call(marking.SYSTEM, marking.build(question, payload), _MarkBatch)
    if result is not None:
        by_learner = {m.learner_id: m for m in result.marks}
        if all(s.learner_id in by_learner for s in subs):
            return [_from_model(question, s, by_learner[s.learner_id]) for s in subs], True
    return [mark_written_offline(question, s) for s in subs], False


def _from_model(question: dict[str, Any], sub: Any, out: _MarkOut) -> Mark:
    max_marks = float(question["max_marks"])
    return Mark(
        question_id=question["question_id"], learner_id=sub.learner_id,
        awarded=max(0.0, min(max_marks, float(out.awarded))), max_marks=max_marks,
        confidence=out.confidence, criteria_met=out.criteria_met,
        criteria_missed=out.criteria_missed, source="model",
    )


def _ms(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)
