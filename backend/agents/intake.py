"""Intake. Deterministic. Loads the batch and each learner's prior record.

Never drops a learner for missing history. A learner who left and came back is
the normal case at Meridian, not an exception to be filtered out.
"""

from __future__ import annotations

import time

from backend import db
from backend.lms import mock_api
from backend.models import LearnerContext, Submission
from backend.state import LoopState, trace

AGENT = "intake"


def run(state: LoopState) -> LoopState:
    started = time.perf_counter()
    assessment_id = state["assessment_id"]
    trace(state, AGENT, "start", f"Loading submissions for {assessment_id} from the LMS connector")

    raw = mock_api.get_submissions(assessment_id)
    state["submissions"] = [Submission(**s) for s in raw]
    meta = mock_api.get_cohort_meta(assessment_id)
    expected = meta["assessments_expected"]

    present_by_learner = _assessments_present(meta["learners"], expected)
    contexts: list[LearnerContext] = []
    for learner in meta["learners"]:
        contexts.append(_build_context(learner, present_by_learner, expected, assessment_id))
    state["learners"] = contexts

    returners = [c.learner_id for c in contexts if c.returner]
    sparse = [c.learner_id for c in contexts if c.low_confidence_history]
    absent = [c.learner_id for c in contexts if assessment_id not in c.assessments_present]

    trace(state, AGENT, "history",
          f"{len(contexts)} learners on roll. Returners: {', '.join(returners) or 'none'}. "
          f"Sparse history (<50 percent of expected assessments): {', '.join(sparse) or 'none'}",
          level="decision" if sparse else "info")
    if absent:
        trace(state, AGENT, "absent",
              f"No submission for {assessment_id} from {', '.join(absent)}. "
              f"Kept on roll, excluded from this batch's marking only.", level="warning")
    trace(state, AGENT, "end",
          f"{len(state['submissions'])} responses from "
          f"{len({s.learner_id for s in state['submissions']})} learners ready to mark",
          duration_ms=_ms(started))
    return state


def _assessments_present(learners: list[dict], expected: list[str]) -> dict[str, list[str]]:
    """Which of the class's assessments each learner actually has submissions for, from
    the LMS. The class's own list is used, not the demo schemes, so an uploaded
    class is judged against its own tests."""
    present: dict[str, set[str]] = {l["learner_id"]: set() for l in learners}
    for aid in expected:
        for sub in mock_api.get_submissions(aid):
            present.setdefault(sub["learner_id"], set()).add(aid)
    return {lid: sorted(v) for lid, v in present.items()}


def _build_context(learner: dict, present_by_learner: dict[str, list[str]],
                   expected: list[str], assessment_id: str) -> LearnerContext:
    lid = learner["learner_id"]
    present = present_by_learner.get(lid, [])
    completeness = round(len(present) / len(expected), 3) if expected else 1.0
    returner = len(present) < len(expected)
    prior: dict[str, list[str]] = {}
    for row in db.learner_history(lid, before_assessment=assessment_id):
        prior.setdefault(row["assessment_id"], []).append(row["taxonomy_node"])
    low_conf = completeness < 0.5
    note = None
    if returner:
        missing = [a for a in expected if a not in present]
        note = (f"Returned after a gap. Missing {', '.join(missing)}. "
                f"History completeness {completeness:.0%}.")
        if low_conf:
            note += (" Recurrence claims for this learner are low confidence and must be "
                     "downweighted by the cohort analyst.")
    return LearnerContext(
        learner_id=lid, learner_name=learner["name"], returner=returner,
        history_completeness=completeness, assessments_present=present,
        assessments_expected=expected, prior_nodes=prior,
        low_confidence_history=low_conf, note=note,
    )


def _ms(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)
