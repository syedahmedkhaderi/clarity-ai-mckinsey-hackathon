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
from concurrent.futures import ThreadPoolExecutor
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

    # Drafting a learner's feedback depends on the diagnoses, not on the plan, so
    # it runs while the candidate actions are being proposed and fitted.
    with ThreadPoolExecutor(max_workers=1) as pool:
        pending_drafts = pool.submit(_draft_feedback, state)
        trace(state, AGENT, "proposing",
              "Asking for candidate actions against the cohort patterns, and drafting "
              "learner feedback at the same time.")
        candidates = _propose(state, patterns.nodes if patterns else [])
        drafts = pending_drafts.result()

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
                   _ActionBatch, smart=config.PLANNER_SMART)
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
    if not proposed:
        return rule_actions
    return _merge_guarantees(proposed, rule_actions, state, nodes)


def _merge_guarantees(proposed: list[PlannedAction], rule_actions: list[PlannedAction],
                      state: LoopState, nodes: list[NodePattern]) -> list[PlannedAction]:
    """Reconciles the model's proposal with the commitments it cannot override.

    The model proposes freely, but three things follow from rules rather than
    from its judgement:

    - Every learner with a diagnosis gets a drafted feedback note reviewed.
    - Every learner returning after a gap gets a restart point. A plan that
      quietly omits a returner is exactly the failure Meridian described.
    - A group re-teach exists for a node if and only if the cohort analyst
      classified that node as a teaching problem. That classification is a
      deterministic threshold, so the action following from it is too. Letting
      the model add a group session for a node under the threshold, or omit one
      above it, would mean the plan contradicted the cohort view next to it.
    """
    teaching = {n.node_id for n in nodes if n.teaching_problem}
    guarantees = [a for a in rule_actions
                  if a.type == "feedback_review" or a.action_id.startswith("RS-")
                  or (a.type == "group_reteach" and a.node_id in teaching)]
    covered = {(a.type, tuple(sorted(a.learner_ids))) for a in guarantees}

    kept: list[PlannedAction] = []
    contradicted = 0
    for a in proposed:
        if a.type == "group_reteach":
            # The cohort analyst owns this call, not the model.
            contradicted += 1
            continue
        if (a.type, tuple(sorted(a.learner_ids))) in covered:
            continue
        kept.append(a)

    restarts = [a for a in guarantees if a.action_id.startswith("RS-")]
    reteaches = [a for a in guarantees if a.type == "group_reteach"]
    if restarts:
        trace(state, AGENT, "guaranteed",
              f"{len(restarts)} restart points for learners returning after a gap were added to "
              f"the model's proposal. A returner is never dropped from a plan.", level="decision")
    if contradicted or reteaches:
        trace(state, AGENT, "guaranteed",
              f"Group sessions come from the cohort threshold, not the model. "
              f"{len(reteaches)} kept for nodes above the threshold, {contradicted} proposed by "
              f"the model discarded so the plan cannot contradict the cohort view.",
              level="decision")
    return kept + guarantees


def _rule_candidates(state: LoopState, nodes: list[NodePattern]) -> list[PlannedAction]:
    actions: list[PlannedAction] = []
    contexts = {c.learner_id: c for c in state["learners"]}
    # A learner already sitting in a group session on a node does not also need a
    # one-to-one on the same node. Proposing both would burn the budget twice on
    # one problem and would read as an agent that cannot see its own plan.
    covered = {(lid, n.node_id) for n in nodes if n.teaching_problem for lid in n.learner_ids}

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
            if (learner_id, node.node_id) in covered:
                continue
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
            cost_minutes=config.ACTION_COSTS["peer_pairing"], severity=0.74,
            justification=f"{explainer} showed {node.node_id} in an earlier assessment and no "
                          f"longer does. {learner} still does. Fifteen minutes fixes it for "
                          f"{learner} and consolidates it for {explainer}.",
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

    ordered = sorted(by_learner.items())
    names, payloads = [], []
    for learner_id, items in ordered:
        ctx = contexts.get(learner_id)
        names.append(ctx.learner_name if ctx else learner_id)
        payloads.append([{"label": _label(d.taxonomy_node), "error_class": d.error_class,
                          "evidence_span": d.evidence_span,
                          "remediation_hint": _hint(d.taxonomy_node)} for d in items])

    # One learner's feedback does not depend on another's, so they are drafted
    # together rather than one at a time.
    def progress(done: int, total: int) -> None:
        trace(state, AGENT, "progress", f"Drafted feedback for {done} of {total} learners.")

    outs = llm.call_many(
        feedback_prompt.SYSTEM,
        [feedback_prompt.build(n, p) for n, p in zip(names, payloads)],
        _FeedbackOut, smart=config.PLANNER_SMART, on_progress=progress,
        on_trip=lambda detail: trace(
            state, AGENT, "provider_down",
            f"The model provider stopped answering ({detail}). Feedback for the remaining "
            f"learners is written from the taxonomy's remediation hints instead.",
            level="warning"),
        on_timeout=lambda missing, total: trace(
            state, AGENT, "timeout",
            f"{missing} of {total} feedback drafts did not return in time. Those learners "
            f"got the rule-written draft, which the facilitator can edit.", level="warning"),
    )

    drafts: list[DraftedFeedback] = []
    for (learner_id, items), name, payload, out in zip(ordered, names, payloads, outs):
        drafts.append(DraftedFeedback(
            learner_id=learner_id, learner_name=name,
            node_ids=[d.taxonomy_node for d in items if d.taxonomy_node],
            body=(out.body if out else None) or _rule_feedback(name, payload)))
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
    return f"{lead} {body}{closing}{extra} Your marks are not final until your teacher has checked them."


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
