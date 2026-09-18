"""End to end on a temporary database: A1 and A2 seed the history, A3 is scored.

These are the claims the demo makes out loud, so they are asserted rather than
eyeballed: nothing the agent marks is final, every surviving diagnosis names a
node, the plan respects the time budget, the plan admits what it could not fit,
and every agent leaves a trace a facilitator can read.
"""

from __future__ import annotations

from typing import Any

from backend.graph import GRAPH_NODES


def test_run_completes(pipeline: dict[str, Any]) -> None:
    assert pipeline["status"] == "complete"
    assert pipeline["assessment_id"] == "A3"
    assert pipeline["submissions"], "no submissions were loaded from the LMS connector"


def test_every_mark_is_provisional(pipeline: dict[str, Any]) -> None:
    """The agent never sets a mark that counts. This is a product requirement."""
    assert pipeline["marks"]
    not_provisional = [m for m in pipeline["marks"] if m["provisional"] is not True]
    assert not not_provisional, f"marks escaped the provisional guarantee: {not_provisional}"


def test_every_submission_got_a_mark(pipeline: dict[str, Any]) -> None:
    assert len(pipeline["marks"]) == len(pipeline["submissions"])


def test_surviving_diagnoses_all_name_a_node(pipeline: dict[str, Any]) -> None:
    """A diagnosis that passed the reviewer gate without naming a node would be a
    row in the cohort heatmap with nothing behind it."""
    assert pipeline["diagnoses"]
    unnamed = [(d["learner_id"], d["question_id"]) for d in pipeline["diagnoses"]
               if not d["taxonomy_node"]]
    assert not unnamed, f"diagnoses survived the gate with no taxonomy node: {unnamed}"


def test_only_responses_that_lost_marks_are_diagnosed(pipeline: dict[str, Any]) -> None:
    lost = {(m["learner_id"], m["question_id"]) for m in pipeline["marks"]
            if m["awarded"] < m["max_marks"]}
    diagnosed = {(d["learner_id"], d["question_id"]) for d in pipeline["diagnoses"]}
    assert diagnosed <= lost, f"diagnosed responses that did not lose marks: {diagnosed - lost}"


def test_plan_respects_the_budget(pipeline: dict[str, Any]) -> None:
    plan = pipeline["plan"]
    assert plan is not None, "the planner did not run"
    assert plan["minutes_used"] <= plan["budget_minutes"]
    scheduled_cost = sum(a["cost_minutes"] for a in plan["scheduled"])
    assert scheduled_cost == plan["minutes_used"], (
        "minutes_used must be the sum of what was actually scheduled")


def test_plan_admits_what_it_could_not_fit(pipeline: dict[str, Any]) -> None:
    """An agent that quietly trims its plan to fit hides the trade-off."""
    dropped = pipeline["plan"]["dropped"]
    budget_drops = [a for a in dropped if a["drop_reason"] == "budget exhausted"]
    assert budget_drops, "nothing was dropped, so the budget trade-off is invisible"
    for action in budget_drops:
        assert action["scheduled"] is False
        assert action["severity"] > 0.0, "a dropped action with no severity cannot be triaged"


def test_trace_events_are_well_formed(pipeline: dict[str, Any]) -> None:
    assert pipeline["trace"]
    for event in pipeline["trace"]:
        assert event["agent"], f"trace event with no agent: {event}"
        assert event["action"], f"trace event with no action: {event}"
        assert event["timestamp"], f"trace event with no timestamp: {event}"


def test_every_graph_node_emitted_a_trace_event(pipeline: dict[str, Any]) -> None:
    """The trace panel is how the UI shows the agents interacting. A silent node
    is a gap in that story."""
    agents = {e["agent"] for e in pipeline["trace"]}
    missing = [node for node in GRAPH_NODES if node not in agents]
    assert not missing, f"these graph nodes emitted no trace event: {missing}"


def test_reviewer_escalations_are_readable(pipeline: dict[str, Any]) -> None:
    for esc in pipeline["escalations"]:
        assert esc["reason_code"]
        assert esc["raised_by"]
        assert esc["would_have_decided"].strip(), (
            f"escalation {esc['escalation_id']} does not say what it would have decided")


def test_cohort_analysis_found_a_teaching_problem(pipeline: dict[str, Any]) -> None:
    """Separating one teaching gap from many individual problems is the whole
    point of the cohort analyst."""
    patterns = pipeline["patterns"]
    assert patterns is not None
    teaching = [p for p in patterns["nodes"] if p["teaching_problem"]]
    assert teaching, "no shared misconception was found, so the demo scenario is broken"
    for pattern in teaching:
        assert pattern["share"] >= 0.40
        assert pattern["count"] == len(pattern["learner_ids"])
