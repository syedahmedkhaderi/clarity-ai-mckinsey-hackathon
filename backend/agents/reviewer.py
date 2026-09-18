"""Reviewer. Deterministic gate, not a sequential node.

Invoked at the end of marker, diagnostician and planner. It inspects that node's
output, appends escalations, and strips escalated items from what flows
downstream. Six reason codes, each visible in the queue.

Every escalation carries what the agent would have decided if forced. An
escalation that only says "I am unsure" wastes the facilitator's time.
"""

from __future__ import annotations

from backend import config
from backend.models import Diagnosis, Escalation, Mark, PlannedAction
from backend.state import LoopState, trace

AGENT = "reviewer"


def _add(state: LoopState, esc: Escalation) -> None:
    state.setdefault("escalations", []).append(esc)
    trace(state, AGENT, esc.reason_code, f"{esc.subject}: {esc.reasoning}", level="escalation")


def gate_marks(state: LoopState, marks: list[Mark]) -> list[Mark]:
    """LOW_MARK_CONFIDENCE and COUNTS_TOWARD_RECORD."""
    survivors: list[Mark] = []
    for mark in marks:
        if mark.summative:
            _add(state, Escalation(
                escalation_id=f"E-REC-{mark.learner_id}-{mark.question_id}",
                reason_code="COUNTS_TOWARD_RECORD", raised_by="marker",
                learner_id=mark.learner_id, question_id=mark.question_id,
                subject=f"{mark.learner_id} {mark.question_id}",
                reasoning="This assessment is flagged summative, so the mark would count "
                          "toward the learner's record. The agent never sets a mark that counts.",
                would_have_decided=f"Award {mark.awarded} of {mark.max_marks}."))
            continue
        if mark.confidence < config.MARK_CONFIDENCE_FLOOR:
            _add(state, Escalation(
                escalation_id=f"E-MARK-{mark.learner_id}-{mark.question_id}",
                reason_code="LOW_MARK_CONFIDENCE", raised_by="marker",
                learner_id=mark.learner_id, question_id=mark.question_id,
                subject=f"{mark.learner_id} {mark.question_id}",
                reasoning=f"Mark confidence {mark.confidence:.2f} is below the "
                          f"{config.MARK_CONFIDENCE_FLOOR:.2f} floor. The response could not be "
                          f"read against the scheme with enough certainty to pass downstream.",
                would_have_decided=f"Award {mark.awarded} of {mark.max_marks}, "
                                   f"criteria met: {', '.join(mark.criteria_met) or 'none'}."))
            continue
        survivors.append(mark)
    return survivors


def gate_diagnoses(state: LoopState, diagnoses: list[Diagnosis]) -> list[Diagnosis]:
    """LANGUAGE_BARRIER, AMBIGUOUS_DIAGNOSIS and the confidence floor."""
    survivors: list[Diagnosis] = []
    for d in diagnoses:
        if d.language_flag:
            _add(state, Escalation(
                escalation_id=f"E-LANG-{d.learner_id}-{d.question_id}",
                reason_code="LANGUAGE_BARRIER", raised_by="diagnostician",
                learner_id=d.learner_id, question_id=d.question_id,
                subject=f"{d.learner_id} {d.question_id}",
                reasoning=d.reasoning or "The mathematics appears sound but the expression is "
                                         "broken. This is a language issue, not a misconception.",
                candidate_a=d.taxonomy_node, candidate_b=d.alternative_node,
                would_have_decided="Record no conceptual misconception. Route to language "
                                   "support rather than re-teaching the mathematics."))
            continue
        gap = d.confidence - _runner_up_confidence(d)
        if d.alternative_node and gap < config.AMBIGUITY_GAP:
            _add(state, Escalation(
                escalation_id=f"E-AMB-{d.learner_id}-{d.question_id}",
                reason_code="AMBIGUOUS_DIAGNOSIS", raised_by="diagnostician",
                learner_id=d.learner_id, question_id=d.question_id,
                subject=f"{d.learner_id} {d.question_id}",
                reasoning=f"Top two candidates are within {gap:.2f}, under the "
                          f"{config.AMBIGUITY_GAP:.2f} separation required. "
                          f"{d.reasoning}",
                candidate_a=d.taxonomy_node, candidate_b=d.alternative_node,
                would_have_decided=f"Record {d.taxonomy_node} at confidence {d.confidence:.2f}."))
            continue
        if d.confidence < config.DIAGNOSIS_CONFIDENCE_FLOOR:
            _add(state, Escalation(
                escalation_id=f"E-DIAG-{d.learner_id}-{d.question_id}",
                reason_code="AMBIGUOUS_DIAGNOSIS", raised_by="diagnostician",
                learner_id=d.learner_id, question_id=d.question_id,
                subject=f"{d.learner_id} {d.question_id}",
                reasoning=f"Confidence {d.confidence:.2f} is below the "
                          f"{config.DIAGNOSIS_CONFIDENCE_FLOOR:.2f} floor. {d.reasoning}",
                candidate_a=d.taxonomy_node, candidate_b=d.alternative_node,
                would_have_decided=f"Record {d.taxonomy_node or 'no node'} "
                                   f"at confidence {d.confidence:.2f}."))
            continue
        survivors.append(d)
    return survivors


def gate_sparse_history(state: LoopState, learner_id: str, node_id: str,
                        completeness: float) -> None:
    """SPARSE_HISTORY. Raised by the cohort analyst when a recurrence claim rests
    on a record we know is incomplete."""
    _add(state, Escalation(
        escalation_id=f"E-HIST-{learner_id}-{node_id}",
        reason_code="SPARSE_HISTORY", raised_by="cohort_analyst",
        learner_id=learner_id,
        subject=f"{learner_id} recurrence of {node_id}",
        reasoning=f"History completeness for {learner_id} is {completeness:.0%}, below the "
                  f"{config.SPARSE_HISTORY_FLOOR:.0%} floor. A recurrence claim built on a "
                  f"record with gaps may be an artefact of what is missing.",
        candidate_a=f"{node_id} is recurring",
        candidate_b=f"{node_id} was present all along but unobserved",
        would_have_decided=f"Treat {node_id} as recurring for {learner_id} and weight the "
                           f"intervention accordingly."))


def gate_plan(state: LoopState, dropped: list[PlannedAction]) -> None:
    """BUDGET_OVERFLOW. The facilitator must see the high-severity thing that did
    not fit, otherwise the trade-off is invisible."""
    for action in dropped:
        if action.severity < config.HIGH_SEVERITY_FLOOR:
            continue
        _add(state, Escalation(
            escalation_id=f"E-BUD-{action.action_id}",
            reason_code="BUDGET_OVERFLOW", raised_by="planner",
            learner_id=action.learner_ids[0] if action.learner_ids else None,
            subject=action.title,
            reasoning=f"Severity {action.severity:.2f} is at or above the "
                      f"{config.HIGH_SEVERITY_FLOOR:.2f} threshold but the action needed "
                      f"{action.cost_minutes} minutes that the budget did not have. "
                      f"{action.justification}",
            candidate_a="Schedule it and drop something else",
            candidate_b="Leave it unscheduled until next week",
            would_have_decided=f"Leave {action.title} unscheduled. The facilitator should "
                               f"decide whether to extend the budget or displace another action."))


def _runner_up_confidence(d: Diagnosis) -> float:
    """The runner-up's implied confidence. Absent a second candidate the gap is
    the full confidence, so a single clear candidate never trips the gate."""
    return (1.0 - d.confidence) if d.alternative_node else 0.0
