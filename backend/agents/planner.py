"""Planner. The agentic core.

Given a goal and a hard constraint it decomposes the work itself:

    Goal:       maximise misconceptions resolved in the next week
    Constraint: facilitator_minutes, total

The model proposes candidate actions and scores their severity. Code then sorts
by severity and greedily fills the budget, recording every item it had to drop
and why. The fitting is deliberately not left to the model: an agent that
quietly trims its own plan to fit hides the trade-off, and the trade-off is the
thing worth showing.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field

from backend import config, llm
from backend.agents import reviewer
from backend.lms import mock_api
from backend.models import (
    DraftedFeedback,
    InterventionPlan,
    NodePattern,
    PlannedAction,
)
from backend.prompts import feedback as feedback_prompt
from backend.prompts import planning
from backend.state import LoopState, trace

AGENT = "planner"


class _ActionOut(BaseModel):
    type: str
    title: str
    node_id: str | None = None
    learner_ids: list[str] = Field(default_factory=list)
    severity: float = Field(default=0.5, ge=0.0, le=1.0)
    justification: str = ""
    facilitator_script: str = ""


class _ActionBatch(BaseModel):
    actions: list[_ActionOut]


class _FeedbackOut(BaseModel):
    body: str


def run(state: LoopState) -> LoopState:
    started = time.perf_counter()
    budget = state["facilitator_minutes"]
    patterns = state["patterns"]
    trace(state, AGENT, "start",
          f"Goal: maximise misconceptions resolved next week. "
          f"Hard constraint: {budget} facilitator minutes.")

    candidates = _propose(state, patterns.nodes if patterns else [])
    trace(state, AGENT, "candidates",
          f"{len(candidates)} candidate actions proposed, "
          f"{sum(c.cost_minutes for c in candidates)} minutes of work against a "
          f"{budget} minute budget. The budget cannot hold all of it.")

    scheduled, dropped, used = _fit_budget(candidates, budget)
    for action in dropped:
        trace(state, AGENT, "dropped",
              f"Dropped {action.title} (severity {action.severity:.2f}, "
              f"{action.cost_minutes} min): budget exhausted at {used} of {budget} minutes.",
              level="decision")

    drafts = _draft_feedback(state)
    plan = InterventionPlan(
        batch_id=state["batch_id"], budget_minutes=budget, minutes_used=used,
        scheduled=scheduled, dropped=dropped, feedback=drafts,
        goal="Maximise misconceptions resolved in the next week within the facilitator "
             "time available.",
        generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"))
    state["plan"] = plan

    reviewer.gate_plan(state, dropped)
    trace(state, AGENT, "end",
          f"{len(scheduled)} actions scheduled using {used} of {budget} minutes. "
          f"{len(dropped)} dropped for want of time. {len(drafts)} feedback notes drafted.",
          duration_ms=_ms(started), level="decision")
    return state


def _propose(state: LoopState, nodes: list[NodePattern]) -> list[PlannedAction]:
    """Model proposes, rules bound. Falls back to rules entirely when offline."""
    details = [{**n.model_dump(), "remediation_hint": _hint(n.node_id)} for n in nodes]
    returners = [c.learner_id for c in state["learners"] if c.returner]
    rule_actions = _rule_candidates(state, nodes)
    if not llm.available() or not nodes:
        return rule_actions

    patterns = state["patterns"]
    out = llm.call(planning.SYSTEM,
                   planning.build(patterns.model_dump(), details,
                                  state["facilitator_minutes"], returners),
                   _ActionBatch, smart=True)
    if out is None or not out.actions:
        trace(state, AGENT, "fallback",
              "The planning model call did not return usable actions. Falling back to the "
              "deterministic candidate rules.", level="warning")
        return rule_actions

    proposed: list[PlannedAction] = []
    for i, a in enumerate(out.actions):
        if a.type not in config.ACTION_COSTS or a.type == "feedback_review":
            continue
        proposed.append(PlannedAction(
            action_id=f"A{i + 1:02d}", type=a.type,  # type: ignore[arg-type]
            title=a.title, node_id=a.node_id, learner_ids=a.learner_ids,
            cost_minutes=config.ACTION_COSTS[a.type], severity=a.severity,
            justification=a.justification, facilitator_script=a.facilitator_script))
    reviews = [a for a in rule_actions if a.type == "feedback_review"]
    return proposed + reviews if proposed else rule_actions


def _rule_candidates(state: LoopState, nodes: list[NodePattern]) -> list[PlannedAction]:
    actions: list[PlannedAction] = []
    contexts = {c.learner_id: c for c in state["learners"]}

    for node in nodes:
        if node.kind == "insufficient_data":
            continue
        hint = _hint(node.node_id)
        if node.teaching_problem:
            actions.append(PlannedAction(
                action_id=f"GR-{node.node_id}", type="group_reteach",
                title=f"Group re-teach: {node.label}", node_id=node.node_id,
                learner_ids=node.learner_ids,
                cost_minutes=config.ACTION_COSTS["group_reteach"],
                severity=round(min(0.98, 0.62 + node.share * 0.6 +
                                   (0.08 if node.error_class == "conceptual" else 0.0)), 2),
                justification=f"{node.count} of {node.cohort_size} learners ({node.share:.0%}) "
                              f"show {node.label}. Above the "
                              f"{config.SHARED_MISCONCEPTION_SHARE:.0%} threshold this is one "
                              f"teaching gap, not {node.count} separate learner problems.",
                facilitator_script=hint))
        for learner_id in node.recurring_learner_ids:
            actions.append(PlannedAction(
                action_id=f"IF-{node.node_id}-{learner_id}", type="individual_followup",
                title=f"Individual follow-up: {learner_id} on {node.label}",
                node_id=node.node_id, learner_ids=[learner_id],
                cost_minutes=config.ACTION_COSTS["individual_followup"],
                severity=round(min(0.95, 0.70 +
                                   (0.08 if node.error_class == "conceptual" else 0.0)), 2),
                justification=f"{node.label} has now appeared for {learner_id} in more than "
                              f"one assessment. Repeating an explanation to the whole group "
                              f"has not shifted it.",
                facilitator_script=hint))
        actions.extend(_pairings(node, contexts, hint))

    for learner_id in sorted({d.learner_id for d in state["diagnoses"]}):
        ctx = contexts.get(learner_id)
        actions.append(PlannedAction(
            action_id=f"FB-{learner_id}", type="feedback_review",
            title=f"Review drafted feedback for {ctx.learner_name if ctx else learner_id}",
            learner_ids=[learner_id], cost_minutes=config.ACTION_COSTS["feedback_review"],
            severity=0.32,
            justification="Every learner receives written feedback. The facilitator reads and "
                          "approves the draft before it is sent.",
            facilitator_script="Read the draft, change anything that does not sound like you, "
                               "then approve."))

    for learner_id in sorted(c.learner_id for c in state["learners"] if c.returner):
        ctx = contexts[learner_id]
        actions.append(PlannedAction(
            action_id=f"RS-{learner_id}", type="individual_followup",
            title=f"Restart point for {ctx.learner_name}, returning after a gap",
            learner_ids=[learner_id], cost_minutes=config.ACTION_COSTS["individual_followup"],
            severity=round(0.66 + (1 - ctx.history_completeness) * 0.3, 2),
            justification=f"{ctx.learner_name} has {ctx.history_completeness:.0%} of the "
                          f"expected assessments. Find where to restart rather than assuming "
                          f"the gap was covered.",
            facilitator_script="Ask what they last remember covering, then work one question "
                               "from that topic together before moving on."))
    return actions


def _pairings(node: NodePattern, contexts: dict[str, Any], hint: str) -> list[PlannedAction]:
    """An explainer is a learner who showed this node before and does not now."""
    active = set(node.learner_ids)
    resolved = [lid for lid, ctx in contexts.items()
                if lid not in active and node.node_id in sum(ctx.prior_nodes.values(), [])]
    out: list[PlannedAction] = []
    for explainer, learner in zip(sorted(resolved), sorted(active)):
        out.append(PlannedAction(
            action_id=f"PP-{node.node_id}-{explainer}-{learner}", type="peer_pairing",
            title=f"Peer pairing: {explainer} explains the method for {node.label} to {learner}",
            node_id=node.node_id, learner_ids=[explainer, learner],
            cost_minutes=config.ACTION_COSTS["peer_pairing"], severity=0.55,
            justification=f"{explainer} showed {node.node_id} in an earlier assessment and no "
                          f"longer does. {learner} still does.",
            facilitator_script=f"Ask {explainer} to explain the method to {learner}, not to "
                               f"give the answer. {hint}"))
    return out


def _fit_budget(candidates: list[PlannedAction],
                budget: int) -> tuple[list[PlannedAction], list[PlannedAction], int]:
    """Deterministic greedy fill by severity. Every rejection is recorded."""
    ordered = sorted(candidates, key=lambda a: (-a.severity, a.cost_minutes, a.action_id))
    scheduled: list[PlannedAction] = []
    dropped: list[PlannedAction] = []
    used = 0
    for action in ordered:
        if used + action.cost_minutes <= budget:
            action.scheduled = True
            action.drop_reason = None
            scheduled.append(action)
            used += action.cost_minutes
        else:
            action.scheduled = False
            action.drop_reason = "budget exhausted"
            dropped.append(action)
    return scheduled, dropped, used


def _draft_feedback(state: LoopState) -> list[DraftedFeedback]:
    """Drafts are produced for every learner with a diagnosis, whether or not the
    review time fitted the budget. The budget governs facilitator time, not
    whether the learner hears anything."""
    contexts = {c.learner_id: c for c in state["learners"]}
    by_learner: dict[str, list[Any]] = {}
    for d in state["diagnoses"]:
        if d.taxonomy_node:
            by_learner.setdefault(d.learner_id, []).append(d)

    drafts: list[DraftedFeedback] = []
    for learner_id, items in sorted(by_learner.items()):
        ctx = contexts.get(learner_id)
        name = ctx.learner_name if ctx else learner_id
        payload = [{"label": _label(d.taxonomy_node), "error_class": d.error_class,
                    "evidence_span": d.evidence_span, "remediation_hint": _hint(d.taxonomy_node)}
                   for d in items]
        body = None
        if llm.available():
            out = llm.call(feedback_prompt.SYSTEM, feedback_prompt.build(name, payload),
                           _FeedbackOut, smart=True)
            body = out.body if out else None
        drafts.append(DraftedFeedback(
            learner_id=learner_id, learner_name=name,
            node_ids=[d.taxonomy_node for d in items if d.taxonomy_node],
            body=body or _rule_feedback(name, payload)))
    return drafts


def _rule_feedback(name: str, items: list[dict[str, Any]]) -> str:
    first = items[0]
    lead = (f"{name}, your working on this one is sound." if first["error_class"] == "language"
            else f"{name}, there is one idea here worth going back over.")
    body = f"In your answer you wrote \"{first['evidence_span']}\". " if first["evidence_span"] else ""
    closing = ("The mathematics is right, so the next step is about writing it up, not about "
               "the method." if first["error_class"] == "language"
               else f"Next step: {first['remediation_hint']}")
    extra = (f" The same thing shows up in {len(items) - 1} other answer"
             f"{'s' if len(items) > 2 else ''}." if len(items) > 1 else "")
    return f"{lead} {body}{closing}{extra} Your marks are not final until your facilitator has checked them."


def _node(node_id: str | None) -> dict[str, Any]:
    if not node_id:
        return {}
    for n in mock_api.taxonomy()["nodes"]:
        if n["id"] == node_id:
            return n
    return {}


def _hint(node_id: str | None) -> str:
    return _node(node_id).get("remediation_hint", "")


def _label(node_id: str | None) -> str:
    return _node(node_id).get("label", node_id or "")


def _ms(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)
