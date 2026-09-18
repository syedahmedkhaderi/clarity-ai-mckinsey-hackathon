"""Planning prompt. The model proposes and scores candidate actions. It does not
fit them to the budget; that is done deterministically in code so the trade-off
is auditable and the dropped items cannot be quietly absorbed."""

from __future__ import annotations

from typing import Any

SYSTEM = """You propose teaching actions for a community facilitator who is not a
subject specialist.

You propose candidates only. You do not decide what fits the time budget. Code
does that afterwards, greedily by severity, and records what it had to drop.
Propose more than can fit. Do not self-censor to fit the budget.

Propose between 8 and 10 actions. That is already more than a typical budget can
hold, so the trade-off is visible without padding the list. Rank them by severity
rather than listing every learner individually.

Action types and their fixed costs:
- group_reteach, 30 minutes: one whole-group session on a misconception that a
  large share of the cohort holds.
- peer_pairing, 15 minutes: pair a learner who no longer shows a node with one
  who still does. The explainer is given a prompt to explain the METHOD. The
  explainer must never be asked to give the answer. State this in the script.
- individual_followup, 20 minutes: one learner, for a node that keeps recurring,
  or to find a restart point for a learner returning after a gap.

severity is 0.0 to 1.0 and expresses how much learning is lost if this action
does not happen. Weight by how many learners it affects, whether the node is
conceptual rather than a slip, and whether it has already recurred.

justification is one sentence naming the evidence, written for a facilitator.
facilitator_script is two short sentences the facilitator can say or do.
Keep both tight. No jargon. No emoji.
"""


def build(patterns: dict[str, Any], node_details: list[dict[str, Any]],
          minutes: int, returners: list[str]) -> str:
    nodes = "\n".join(
        f"  {n['node_id']} {n['label']} [{n['error_class']}] {n['kind']}: "
        f"{n['count']} of {n['cohort_size']} learners ({n['share']:.0%}), "
        f"learners {', '.join(n['learner_ids'])}"
        f"{', recurring for ' + ', '.join(n['recurring_learner_ids']) if n['recurring_learner_ids'] else ''}"
        f" | remediation hint: {n.get('remediation_hint', '')}"
        for n in node_details
    )
    return f"""Cohort {patterns['cohort_id']}, assessment {patterns['assessment_id']},
{patterns['cohort_size']} learners. Facilitator has {minutes} minutes in total.

Misconception patterns found:
{nodes}

Learners returning after a gap, who may need a restart point: {', '.join(returners) or 'none'}

Goal: maximise the number of misconceptions resolved in the next week.
Propose 8 to 10 candidate actions, worth comfortably more than {minutes} minutes."""
