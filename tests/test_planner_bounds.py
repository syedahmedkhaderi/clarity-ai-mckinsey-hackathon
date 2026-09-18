"""The model may propose, but it may not schedule a group re-teach for a pattern
the cohort analyst did not flag as shared."""

from __future__ import annotations

from backend.agents import planner
from backend.models import NodePattern, PlannedAction
from backend.state import new_state


def _node(node_id: str, teaching: bool) -> NodePattern:
    return NodePattern(node_id=node_id, label=node_id, topic="T1", error_class="conceptual",
                       learner_ids=["L01"], count=1, cohort_size=12, share=0.08,
                       kind="shared" if teaching else "emerging", teaching_problem=teaching)


def _action(action_id: str, kind: str, node_id: str | None) -> PlannedAction:
    return PlannedAction(action_id=action_id, type=kind, title=action_id, node_id=node_id,
                         learner_ids=["L01"], cost_minutes=30, severity=0.8)


def test_group_reteach_needs_a_shared_pattern() -> None:
    nodes = [_node("M01", teaching=False), _node("M12", teaching=True)]
    proposed = [_action("A01", "group_reteach", "M01"),
                _action("A02", "group_reteach", "M12"),
                _action("A03", "individual_followup", "M01")]
    kept = planner._bound_group_actions(proposed, nodes, new_state("B-test", "A3", "C1", 120))
    assert [a.action_id for a in kept] == ["A02", "A03"]
