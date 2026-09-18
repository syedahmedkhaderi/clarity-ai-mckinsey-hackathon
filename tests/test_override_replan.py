"""The override re-plan. Step 7 of the demo scenario, and the single behaviour
the build plan says to protect above everything else.

A facilitator rejects one M01 diagnosis. The cohort count falls below the shared
misconception threshold, M01 stops being a teaching problem, the group re-teach
is withdrawn, the freed time is reallocated, and the response names what changed
so the UI can highlight it.

Each test starts from a freshly re-run A3 so it does not depend on what any
other test left in the database.
"""

from __future__ import annotations

from typing import Any

import pytest

from backend import service
from backend.models import Override

TARGET = "L06:A3Q4"
SHARED_NODE = "M01"


def _pattern(batch: dict[str, Any], node_id: str) -> dict[str, Any] | None:
    return next((p for p in batch["patterns"]["nodes"] if p["node_id"] == node_id), None)


def _group_reteach(plan: dict[str, Any], node_id: str) -> list[dict[str, Any]]:
    return [a for a in plan["scheduled"]
            if a["type"] == "group_reteach" and a["node_id"] == node_id]


def test_baseline_has_m01_as_a_teaching_problem(fresh_a3: dict[str, Any]) -> None:
    """The demo rests on this number. If it moves, step 7 stops being a money shot."""
    pattern = _pattern(fresh_a3, SHARED_NODE)
    assert pattern is not None, "M01 did not appear in the cohort analysis at all"
    assert pattern["count"] == 5
    assert pattern["cohort_size"] == 12
    assert pattern["teaching_problem"] is True
    assert "L06" in pattern["learner_ids"], f"{TARGET} is the override target and must hold M01"
    assert _group_reteach(fresh_a3["plan"], SHARED_NODE), "no group re-teach to withdraw"


def test_diagnosis_override_withdraws_the_group_reteach(fresh_a3: dict[str, Any]) -> None:
    batch_id = fresh_a3["batch_id"]
    before = _group_reteach(fresh_a3["plan"], SHARED_NODE)[0]

    result = service.apply_override(batch_id, Override(
        type="diagnosis", target_id=TARGET, new_value=None,
        reason="Looked again, the working shows a common denominator."))

    pattern = _pattern(result, SHARED_NODE)
    assert pattern["count"] == 4, "the rejected diagnosis was not removed from the cohort count"
    assert pattern["share"] < 0.40
    assert pattern["teaching_problem"] is False, (
        "M01 is below the threshold now and must stop being called a teaching problem")
    assert not _group_reteach(result["plan"], SHARED_NODE), (
        "the group re-teach was built on a threshold that no longer holds")
    assert all(d["learner_id"] != "L06" or d["question_id"] != "A3Q4"
               for d in result["diagnoses"])


def test_override_reports_what_changed(fresh_a3: dict[str, Any]) -> None:
    """The response carries a changes list so the UI can highlight the difference
    rather than asking the facilitator to spot it."""
    before = _group_reteach(fresh_a3["plan"], SHARED_NODE)[0]
    result = service.apply_override(fresh_a3["batch_id"], Override(
        type="diagnosis", target_id=TARGET, new_value=None, reason="Misread the working."))

    changes = result["changes"]
    assert changes, "the re-plan reported no changes at all"
    removed = [c for c in changes if c["kind"] == "removed"]
    assert any(before["action_id"] == c["action_id"] or before["title"] in c["detail"]
               for c in removed), (
        f"no removed change names the group re-teach {before['action_id']}. Got: {changes}")


def test_replan_still_respects_the_budget(fresh_a3: dict[str, Any]) -> None:
    result = service.apply_override(fresh_a3["batch_id"], Override(
        type="diagnosis", target_id=TARGET, new_value=None, reason="Misread the working."))
    plan = result["plan"]
    assert plan["minutes_used"] <= plan["budget_minutes"], (
        "the freed minutes were reallocated past the hard constraint")
    assert sum(a["cost_minutes"] for a in plan["scheduled"]) == plan["minutes_used"]
    assert result["status"] == "complete"


def test_freed_minutes_are_reallocated(fresh_a3: dict[str, Any]) -> None:
    """Withdrawing a 30 minute action and leaving the time unspent would be a
    worse plan, not a corrected one."""
    before_used = fresh_a3["plan"]["minutes_used"]
    result = service.apply_override(fresh_a3["batch_id"], Override(
        type="diagnosis", target_id=TARGET, new_value=None, reason="Misread the working."))
    after = result["plan"]
    assert after["minutes_used"] >= before_used - 30
    assert after["scheduled"], "the re-plan scheduled nothing"


def test_learner_unavailable_override_removes_the_learner(fresh_a3: dict[str, Any]) -> None:
    result = service.apply_override(fresh_a3["batch_id"], Override(
        type="learner_unavailable", target_id="L06", new_value=None,
        reason="Left the programme this week."))

    assert result["status"] == "complete"
    assert all(c["learner_id"] != "L06" for c in result["learners"])
    assert all(d["learner_id"] != "L06" for d in result["diagnoses"])
    assert all(m["learner_id"] != "L06" for m in result["marks"])
    assert result["patterns"]["cohort_size"] == 11
    assert result["plan"] is not None, "the re-plan must still produce a plan"
    assert result["plan"]["minutes_used"] <= result["plan"]["budget_minutes"]
    for action in result["plan"]["scheduled"] + result["plan"]["dropped"]:
        assert "L06" not in action["learner_ids"], (
            "an unavailable learner is still being scheduled time")


def test_unknown_batch_raises(fresh_a3: dict[str, Any]) -> None:
    with pytest.raises(KeyError):
        service.apply_override("B-does-not-exist", Override(
            type="diagnosis", target_id=TARGET, new_value=None, reason=""))


def test_override_is_recorded_for_audit(fresh_a3: dict[str, Any]) -> None:
    """A facilitator correction that is not written down cannot be reviewed later."""
    from backend import db

    batch_id = fresh_a3["batch_id"]
    service.apply_override(batch_id, Override(
        type="diagnosis", target_id=TARGET, new_value=None, reason="Misread the working."))
    recorded = db.batch_overrides(batch_id)
    assert any(o["target_id"] == TARGET and o["type"] == "diagnosis" for o in recorded)
    assert all(o["created_at"] for o in recorded), "an override with no timestamp is not an audit"
