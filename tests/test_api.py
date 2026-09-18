"""The HTTP surface the frontend builds against.

/api/batch/run returns immediately and the graph runs on a worker thread, so the
trace endpoint is polled here the same way the UI polls it.
"""

from __future__ import annotations

import time
from typing import Any, Iterator

import pytest
from fastapi.testclient import TestClient

from backend.api import app
from backend.graph import GRAPH_EDGES, GRAPH_NODES, REPLAN_ENTRY

POLL_TIMEOUT_SECONDS = 60.0
POLL_INTERVAL_SECONDS = 0.25


@pytest.fixture(scope="module")
def client(pipeline: dict[str, Any]) -> Iterator[TestClient]:
    """Depends on the pipeline fixture so the profile endpoints have history to
    read rather than an empty database."""
    with TestClient(app) as test_client:
        yield test_client


def _run_batch(client: TestClient, assessment_id: str = "A3", minutes: int = 120) -> str:
    response = client.post("/api/batch/run", json={
        "assessment_id": assessment_id, "cohort_id": "C1", "facilitator_minutes": minutes})
    assert response.status_code == 200, response.text
    batch_id = response.json()["batch_id"]
    assert batch_id
    return batch_id


def _wait_for_completion(client: TestClient, batch_id: str) -> dict[str, Any]:
    deadline = time.monotonic() + POLL_TIMEOUT_SECONDS
    payload: dict[str, Any] = {}
    while time.monotonic() < deadline:
        response = client.get(f"/api/batch/{batch_id}/trace")
        assert response.status_code == 200, response.text
        payload = response.json()
        if payload["status"] in ("complete", "failed", "insufficient_signal"):
            return payload
        time.sleep(POLL_INTERVAL_SECONDS)
    pytest.fail(f"batch {batch_id} did not finish within {POLL_TIMEOUT_SECONDS:.0f}s; "
                f"last status {payload.get('status')}")


@pytest.fixture(scope="module")
def ran_batch(client: TestClient) -> str:
    batch_id = _run_batch(client)
    payload = _wait_for_completion(client, batch_id)
    assert payload["status"] == "complete", f"run ended as {payload['status']}"
    return batch_id


def test_health_reports_the_graph_shape(client: TestClient) -> None:
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["graph"]["nodes"] == GRAPH_NODES
    assert [tuple(e) for e in body["graph"]["edges"]] == GRAPH_EDGES
    assert body["graph"]["replan_entry"] == REPLAN_ENTRY
    assert body["mode"]
    assert body["thresholds"]["shared_misconception_share"] == 0.40


def test_trace_is_pollable_while_running(client: TestClient, ran_batch: str) -> None:
    body = client.get(f"/api/batch/{ran_batch}/trace").json()
    assert body["total"] == len(body["events"])
    assert body["events"], "the run produced no trace for the UI to animate"
    tail = client.get(f"/api/batch/{ran_batch}/trace", params={"since": body["total"] - 1}).json()
    assert len(tail["events"]) == 1, "the since cursor does not page the trace"


def test_batch_endpoint_returns_the_full_state(client: TestClient, ran_batch: str) -> None:
    state = client.get(f"/api/batch/{ran_batch}").json()
    for key in ("submissions", "learners", "marks", "diagnoses", "patterns", "plan",
                "escalations", "trace", "status"):
        assert key in state, f"the state is missing {key}, which the frontend contract needs"
    assert state["status"] == "complete"
    assert state["plan"]["minutes_used"] <= state["plan"]["budget_minutes"]


def test_plan_and_escalation_endpoints(client: TestClient, ran_batch: str) -> None:
    plan = client.get(f"/api/batch/{ran_batch}/plan").json()
    assert plan["plan"]["scheduled"]
    assert plan["plan"]["dropped"], "the dropped list is what makes the trade-off visible"
    escalations = client.get(f"/api/batch/{ran_batch}/escalations").json()
    assert isinstance(escalations, list)
    for escalation in escalations:
        assert escalation["would_have_decided"]


def test_learner_profile_spans_more_than_one_assessment(client: TestClient) -> None:
    """L07 is the returner the demo opens. Her profile is the proof that LOOP has
    a memory rather than marking each batch cold."""
    body = client.get("/api/learner/L07/profile").json()
    assert body["learner_id"] == "L07"
    assert len(body["assessments"]) > 1, (
        f"L07's profile only covers {sorted(body['assessments'])}")
    assert body["entries"]
    for entry in body["entries"]:
        assert entry["taxonomy_node"]


def test_unknown_batch_is_404(client: TestClient) -> None:
    assert client.get("/api/batch/B-nope").status_code == 404
    assert client.get("/api/batch/B-nope/trace").status_code == 404
    assert client.get("/api/batch/B-nope/plan").status_code == 404


def test_invalid_override_type_is_400(client: TestClient, ran_batch: str) -> None:
    response = client.post(f"/api/batch/{ran_batch}/override", json={
        "type": "not_a_real_type", "target_id": "L06:A3Q4", "reason": "typo"})
    assert response.status_code == 400
    assert "not_a_real_type" in response.text


def test_override_on_unknown_batch_is_404(client: TestClient) -> None:
    response = client.post("/api/batch/B-nope/override", json={
        "type": "diagnosis", "target_id": "L06:A3Q4", "reason": "x"})
    assert response.status_code == 404


def test_lms_endpoints_are_shaped_like_an_lms(client: TestClient) -> None:
    courses = client.get("/api/lms/courses").json()
    assert courses and "id" in courses[0]
    assignments = client.get(f"/api/lms/courses/{courses[0]['id']}/assignments").json()
    assert assignments
    submissions = client.get(f"/api/lms/assignments/{assignments[0]['id']}/submissions").json()
    assert submissions and "learner_id" in submissions[0]


def test_approve_clears_the_provisional_flag(client: TestClient, ran_batch: str) -> None:
    """A mark counts only once a human has approved it. This is the endpoint that
    makes that true."""
    state = client.get(f"/api/batch/{ran_batch}").json()
    mark = state["marks"][0]
    item = f"{mark['learner_id']}:{mark['question_id']}"
    assert mark["provisional"] is True
    response = client.post(f"/api/batch/{ran_batch}/approve", json={"item_ids": [item]})
    assert response.status_code == 200
    after = client.get(f"/api/batch/{ran_batch}").json()
    approved = next(m for m in after["marks"]
                    if (m["learner_id"], m["question_id"]) == (mark["learner_id"],
                                                               mark["question_id"]))
    assert approved["provisional"] is False
