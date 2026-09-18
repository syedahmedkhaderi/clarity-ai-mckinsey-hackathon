"""Cohort Analyst. Deterministic. Separates an individual problem from a
teaching problem.

Three classifications and one refusal:
- shared      a node held by at least 40 percent of the cohort, a teaching problem
- recurring   a node seen for the same learner in two or more assessments
- emerging    a node present now that was not present before
- refusal     fewer than 4 learners have data for the topic, so no pattern is called

The refusal matters. Calling a pattern on three learners would be the kind of
claim that erodes a facilitator's trust in the whole system.
"""

from __future__ import annotations

import time
from collections import defaultdict
from typing import Any

from backend import config, db
from backend.agents import reviewer
from backend.lms import mock_api
from backend.models import CohortPatterns, LearnerContext, NodePattern
from backend.state import LoopState, trace

AGENT = "cohort_analyst"


def run(state: LoopState) -> LoopState:
    started = time.perf_counter()
    cohort_size = len(state["learners"])
    trace(state, AGENT, "start",
          f"Aggregating {len(state['diagnoses'])} surviving diagnoses across "
          f"{cohort_size} learners")

    by_node: dict[str, list[str]] = defaultdict(list)
    for d in state["diagnoses"]:
        if d.taxonomy_node and d.learner_id not in by_node[d.taxonomy_node]:
            by_node[d.taxonomy_node].append(d.learner_id)

    contexts = {c.learner_id: c for c in state["learners"]}
    topic_counts = _topic_learner_counts(state)
    notes: list[str] = []
    skipped: list[str] = []
    patterns: list[NodePattern] = []

    for node_id, learners in sorted(by_node.items()):
        meta = _node_meta(node_id)
        topic = meta.get("topic", "")
        sample = topic_counts.get(topic, 0)
        if sample < config.MIN_LEARNERS_FOR_PATTERN:
            skipped.append(topic)
            notes.append(f"{node_id} ({topic}): only {sample} learners have usable data for "
                         f"this topic, under the minimum of {config.MIN_LEARNERS_FOR_PATTERN}. "
                         f"No pattern called.")
            patterns.append(_pattern(node_id, meta, learners, cohort_size, "insufficient_data",
                                     note=f"Sample of {sample} learners is too small to call a "
                                          f"pattern."))
            continue
        recurring, downweighted = _recurrence(state, node_id, learners, contexts)
        share = round(len(learners) / cohort_size, 3) if cohort_size else 0.0
        kind = _classify(share, recurring, node_id, contexts, learners)
        patterns.append(_pattern(node_id, meta, learners, cohort_size, kind,
                                 recurring=recurring, downweighted=downweighted,
                                 teaching=share >= config.SHARED_MISCONCEPTION_SHARE))

    shared = [p for p in patterns if p.teaching_problem]
    for p in shared:
        trace(state, AGENT, "teaching_problem",
              f"{p.node_id} {p.label} is held by {p.count} of {p.cohort_size} learners "
              f"({p.share:.0%}), at or above the {config.SHARED_MISCONCEPTION_SHARE:.0%} "
              f"threshold. This is a teaching problem, not {p.count} individual problems.",
              level="decision")
    for note in notes:
        trace(state, AGENT, "sample_too_small", note, level="warning")

    state["patterns"] = CohortPatterns(
        cohort_id=state["cohort_id"], assessment_id=state["assessment_id"],
        cohort_size=cohort_size, nodes=patterns,
        skipped_topics=sorted(set(skipped)), notes=notes)
    trace(state, AGENT, "end",
          f"{len(patterns)} nodes analysed. {len(shared)} shared, "
          f"{sum(1 for p in patterns if p.kind == 'recurring')} recurring, "
          f"{sum(1 for p in patterns if p.kind == 'emerging')} emerging, "
          f"{len(skipped)} topics with too little data to call",
          duration_ms=_ms(started), level="decision")
    return state


def _classify(share: float, recurring: list[str], node_id: str,
              contexts: dict[str, LearnerContext], learners: list[str]) -> str:
    if share >= config.SHARED_MISCONCEPTION_SHARE:
        return "shared"
    if recurring:
        return "recurring"
    seen_before = any(node_id in sum(contexts[l].prior_nodes.values(), [])
                      for l in learners if l in contexts)
    return "recurring" if seen_before else "emerging"


def _recurrence(state: LoopState, node_id: str, learners: list[str],
                contexts: dict[str, LearnerContext]) -> tuple[list[str], list[str]]:
    """A node counts as recurring for a learner when it appears in this assessment
    and in at least one earlier one. Claims resting on a sparse record are
    downweighted and escalated."""
    recurring: list[str] = []
    downweighted: list[str] = []
    for learner_id in learners:
        ctx = contexts.get(learner_id)
        if ctx is None:
            continue
        prior = [a for a, nodes in ctx.prior_nodes.items() if node_id in nodes]
        if len(prior) + 1 < config.RECURRENCE_MIN_ASSESSMENTS:
            continue
        if ctx.history_completeness < config.SPARSE_HISTORY_FLOOR:
            downweighted.append(learner_id)
            trace(state, AGENT, "downweighted",
                  f"{learner_id} shows {node_id} in {', '.join(prior)} and now, but history "
                  f"completeness is {ctx.history_completeness:.0%}. The recurrence claim is "
                  f"downweighted and sent for human confirmation.", level="warning")
            reviewer.gate_sparse_history(state, learner_id, node_id, ctx.history_completeness)
            continue
        recurring.append(learner_id)
    return recurring, downweighted


def _topic_learner_counts(state: LoopState) -> dict[str, int]:
    """How many learners have at least one marked response on each topic. A node
    on a topic with too little data cannot support a cohort claim."""
    counts: dict[str, set[str]] = defaultdict(set)
    marked = {(m.learner_id, m.question_id) for m in state["marks"]}
    for sub in state["submissions"]:
        if (sub.learner_id, sub.question_id) in marked:
            counts[sub.topic].add(sub.learner_id)
    return {topic: len(v) for topic, v in counts.items()}


def _pattern(node_id: str, meta: dict[str, Any], learners: list[str], cohort_size: int,
             kind: str, recurring: list[str] | None = None,
             downweighted: list[str] | None = None, teaching: bool = False,
             note: str | None = None) -> NodePattern:
    return NodePattern(
        node_id=node_id, label=meta.get("label", node_id), topic=meta.get("topic", ""),
        error_class=meta.get("error_class", "unclassified"),
        learner_ids=sorted(learners), count=len(learners), cohort_size=cohort_size,
        share=round(len(learners) / cohort_size, 3) if cohort_size else 0.0,
        kind=kind, recurring_learner_ids=sorted(recurring or []),
        downweighted_learner_ids=sorted(downweighted or []),
        teaching_problem=teaching, note=note)


def _node_meta(node_id: str) -> dict[str, Any]:
    for node in mock_api.taxonomy()["nodes"]:
        if node["id"] == node_id:
            return node
    return {}


def _ms(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)
