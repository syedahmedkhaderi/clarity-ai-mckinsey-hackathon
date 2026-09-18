"""Unit tests on the reviewer gate, with hand-built marks and diagnoses.

The gate is the only thing standing between the agent and a decision it should
not be making alone, so it is tested directly rather than through a whole run.

Every escalation is also checked for a non-empty would_have_decided. An
escalation that says only "I am unsure" gives the facilitator nothing to act on.
"""

from __future__ import annotations

from typing import Any

import pytest

from backend import config
from backend.agents import reviewer
from backend.models import Diagnosis, Mark, PlannedAction


def _state() -> dict[str, Any]:
    return {"escalations": [], "trace": []}


def _mark(confidence: float = 0.9, summative: bool = False) -> Mark:
    return Mark(question_id="A3Q4", learner_id="L01", awarded=1.0, max_marks=3.0,
                confidence=confidence, criteria_met=["Identifies a common denominator"],
                criteria_missed=["Correct final answer"], summative=summative)


def _diagnosis(confidence: float = 0.9, alternative: str | None = None,
               language_flag: bool = False) -> Diagnosis:
    return Diagnosis(question_id="A3Q4", learner_id="L01", taxonomy_node="M01",
                     alternative_node=alternative, error_class="conceptual",
                     confidence=confidence, evidence_span="2/7",
                     reasoning="The numerators and denominators were added separately.",
                     language_flag=language_flag, source="fallback", topic="T2")


def _codes(state: dict[str, Any]) -> list[str]:
    return [e.reason_code for e in state["escalations"]]


def test_low_confidence_mark_is_escalated_and_removed() -> None:
    state = _state()
    mark = _mark(confidence=config.MARK_CONFIDENCE_FLOOR - 0.01)
    survivors = reviewer.gate_marks(state, [mark])
    assert survivors == []
    assert _codes(state) == ["LOW_MARK_CONFIDENCE"]
    assert state["escalations"][0].raised_by == "marker"


def test_mark_at_the_floor_survives() -> None:
    """The floor is inclusive. A boundary that moved would change the queue size
    on stage without anyone noticing."""
    state = _state()
    survivors = reviewer.gate_marks(state, [_mark(confidence=config.MARK_CONFIDENCE_FLOOR)])
    assert len(survivors) == 1
    assert state["escalations"] == []


def test_summative_mark_escalates_even_when_confident() -> None:
    """The agent never sets a mark that counts toward a learner's record."""
    state = _state()
    survivors = reviewer.gate_marks(state, [_mark(confidence=1.0, summative=True)])
    assert survivors == []
    assert _codes(state) == ["COUNTS_TOWARD_RECORD"]


def test_language_flag_escalates_rather_than_naming_a_concept() -> None:
    """A learner whose mathematics is right but whose English is broken must not
    be recorded as conceptually weak."""
    state = _state()
    survivors = reviewer.gate_diagnoses(state, [_diagnosis(confidence=0.95,
                                                           language_flag=True)])
    assert survivors == []
    assert _codes(state) == ["LANGUAGE_BARRIER"]
    escalation = state["escalations"][0]
    assert escalation.candidate_a == "M01"
    assert "language support" in escalation.would_have_decided.lower()


def test_close_candidates_escalate_as_ambiguous() -> None:
    state = _state()
    close = _diagnosis(confidence=0.57, alternative="M02")
    gap = close.confidence - (1.0 - close.confidence)
    assert gap < config.AMBIGUITY_GAP, "fixture no longer exercises the ambiguity gap"
    survivors = reviewer.gate_diagnoses(state, [close])
    assert survivors == []
    assert _codes(state) == ["AMBIGUOUS_DIAGNOSIS"]
    assert state["escalations"][0].candidate_b == "M02"


def test_low_confidence_diagnosis_escalates() -> None:
    state = _state()
    survivors = reviewer.gate_diagnoses(
        state, [_diagnosis(confidence=config.DIAGNOSIS_CONFIDENCE_FLOOR - 0.05)])
    assert survivors == []
    assert _codes(state) == ["AMBIGUOUS_DIAGNOSIS"]


def test_clean_diagnosis_survives() -> None:
    state = _state()
    clean = _diagnosis(confidence=0.91, alternative="M02")
    survivors = reviewer.gate_diagnoses(state, [clean])
    assert survivors == [clean]
    assert state["escalations"] == []


def test_high_severity_drop_escalates_as_budget_overflow() -> None:
    state = _state()
    action = PlannedAction(action_id="GR-M01", type="group_reteach", title="Group re-teach: M01",
                           node_id="M01", learner_ids=["L01", "L02"], cost_minutes=30,
                           severity=config.HIGH_SEVERITY_FLOOR + 0.1,
                           justification="Half the cohort shows this.", scheduled=False,
                           drop_reason="budget exhausted")
    low = action.model_copy(update={"action_id": "PP-1",
                                    "severity": config.HIGH_SEVERITY_FLOOR - 0.1})
    reviewer.gate_plan(state, [action, low])
    assert _codes(state) == ["BUDGET_OVERFLOW"], (
        "only drops above the high-severity floor belong in the queue")


def test_sparse_history_escalation_names_both_readings() -> None:
    state = _state()
    reviewer.gate_sparse_history(state, "L07", "M01", 0.25)
    escalation = state["escalations"][0]
    assert escalation.reason_code == "SPARSE_HISTORY"
    assert escalation.candidate_a and escalation.candidate_b
    assert escalation.candidate_a != escalation.candidate_b


@pytest.mark.parametrize("build", [
    lambda s: reviewer.gate_marks(s, [_mark(confidence=0.2)]),
    lambda s: reviewer.gate_marks(s, [_mark(summative=True)]),
    lambda s: reviewer.gate_diagnoses(s, [_diagnosis(language_flag=True)]),
    lambda s: reviewer.gate_diagnoses(s, [_diagnosis(confidence=0.57, alternative="M02")]),
    lambda s: reviewer.gate_diagnoses(s, [_diagnosis(confidence=0.4)]),
    lambda s: reviewer.gate_sparse_history(s, "L07", "M01", 0.25),
])
def test_every_escalation_says_what_it_would_have_decided(build: Any) -> None:
    """An escalation that does not say what the agent would have done is useless
    to a facilitator working through the queue."""
    state = _state()
    build(state)
    assert state["escalations"], "this trigger produced no escalation"
    for escalation in state["escalations"]:
        assert escalation.would_have_decided.strip(), (
            f"{escalation.reason_code} escalated without saying what it would have decided")
        assert escalation.reasoning.strip(), f"{escalation.reason_code} gave no reasoning"


def test_every_escalation_leaves_a_trace_event() -> None:
    state = _state()
    reviewer.gate_diagnoses(state, [_diagnosis(language_flag=True)])
    assert len(state["trace"]) == len(state["escalations"])
    assert state["trace"][0].level == "escalation"
