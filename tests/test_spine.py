"""The shared spine the upload, email and chat features are built on.

Everything here runs offline against the throwaway database from conftest. The
uploaded rows a test inserts are deleted by id afterwards, so the demo class and
the other test files never see them.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterator

import pytest
from fastapi.testclient import TestClient

from backend import config, db, llm, students
from backend.api import app
from backend.lms import mock_api
from backend.routers import insights
from backend.uploads import registry

ROOT = config.ROOT
CLASS_ID = "C98"
TEST_ID = "U98"
LEARNERS = (("C98-S01", "Ada L."), ("C98-S02", "Grace H."))
SPEC = {
    "assessment_id": TEST_ID, "class_id": CLASS_ID, "name": "Fractions check",
    "topic_coverage": ["T1"],
    "questions": [
        {"question_id": "U98Q01", "topic": "T1", "type": "mcq", "max_marks": 1,
         "prompt": "What is 1/2 + 1/4?", "options": {"a": "2/6", "b": "3/4"}, "correct": "b",
         "distractor_map": {}, "origin": "uploaded"},
        {"question_id": "U98Q02", "topic": "T1", "type": "written", "max_marks": 2,
         "prompt": "Add 1/3 and 1/6.", "model_answer": "1/2",
         "criteria": [{"marks": 1, "text": "Finds a common denominator"},
                      {"marks": 1, "text": "Adds numerators"}], "origin": "uploaded"},
    ],
}


@pytest.fixture(scope="module")
def client(pipeline: dict[str, Any]) -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def uploaded(pipeline: dict[str, Any]) -> Iterator[None]:
    """One uploaded class with one test and two answered students."""
    db.init_db()
    with db.connect() as conn:
        conn.execute("INSERT INTO classes VALUES (?,?,?)", (CLASS_ID, "Year 9 Maths", "2026-09-01"))
        conn.execute("INSERT INTO uploaded_tests VALUES (?,?,?,?,?,?,?,?)",
                     (TEST_ID, CLASS_ID, 98, "Fractions check", "2026-09-30T17:00:00Z",
                      "2026-09-01", json.dumps(SPEC), "[]"))
        conn.executemany(
            "INSERT INTO students (learner_id, class_id, ref, name, email, origin) "
            "VALUES (?,?,?,?,?,?)",
            [(lid, CLASS_ID, lid[-3:], name, "", "uploaded") for lid, name in LEARNERS])
        conn.executemany(
            "INSERT INTO uploaded_answers VALUES (?,?,?,?,?,?)",
            [(TEST_ID, lid, qid, ans, sel, "2026-09-02T09:00:00Z")
             for lid, _ in LEARNERS
             for qid, ans, sel in (("U98Q01", "3/4", "b"), ("U98Q02", "1/2", None))])
    try:
        yield
    finally:
        with db.connect() as conn:
            conn.execute("DELETE FROM uploaded_answers WHERE assessment_id=?", (TEST_ID,))
            conn.execute("DELETE FROM uploaded_tests WHERE assessment_id=?", (TEST_ID,))
            conn.executemany("DELETE FROM students WHERE learner_id=?", [(l,) for l, _ in LEARNERS])
            conn.execute("DELETE FROM classes WHERE class_id=?", (CLASS_ID,))


# --- demo data ---------------------------------------------------------------

def test_points_possible_is_the_sum_of_question_marks() -> None:
    schemes = {s["assessment_id"]: s for s in mock_api.schemes()["assessments"]}
    rows = mock_api.get_assignments("C1")
    assert [r["id"] for r in rows] == ["A1", "A2", "A3", "A4"]
    for row in rows:
        assert row["points_possible"] == sum(q["max_marks"] for q in schemes[row["id"]]["questions"])
        assert row["points_possible"] == 14


def test_demo_assignments_gain_only_additive_fields() -> None:
    row = mock_api.get_assignments("C1")[2]
    assert row["name"] == "Assessment 3 - Foundational Mathematics"
    assert (row["display_name"], row["source"], row["needs_ai"], row["class_id"]) == (
        "Test 3", "demo", False, "C1")


def test_contacts_cover_every_demo_learner_on_a_reserved_domain() -> None:
    _, contacts = students.load_contacts()
    roster = {l["learner_id"]: l["name"] for l in mock_api.get_roster("C1")}
    assert {c["learner_id"] for c in contacts} == set(roster) and len(contacts) == 12
    for contact in contacts:
        assert contact["name"] == roster[contact["learner_id"]]
        assert contact["email"].endswith("@example.com")


def test_seed_is_idempotent_and_keeps_a_teacher_edit(pipeline: dict[str, Any]) -> None:
    db.init_db()
    assert students.seed_demo_students() == 0
    with db.connect() as conn:
        conn.execute("UPDATE students SET email=? WHERE learner_id='L01'", ("thabo@school.org",))
    try:
        db.init_db()
        with db.connect() as conn:
            rows = conn.execute("SELECT * FROM students WHERE class_id='C1'").fetchall()
        assert len(rows) == 12 and {r["origin"] for r in rows} == {"demo"}
        assert next(r for r in rows if r["learner_id"] == "L01")["email"] == "thabo@school.org"
    finally:
        with db.connect() as conn:
            conn.execute("UPDATE students SET email=? WHERE learner_id='L01'",
                         ("thabo.m@example.com",))


def test_demo_courses_keep_c1_first(uploaded: None) -> None:
    courses = mock_api.get_courses()
    assert courses[0]["id"] == "C1" and courses[0]["enrolled"] == 12
    assert CLASS_ID in [c["id"] for c in courses]
    assert [a["id"] for a in mock_api.get_assignments("C1")] == ["A1", "A2", "A3", "A4"]
    demo = json.loads((config.GENERATED_DIR / "submissions.json").read_text())["submissions"]
    assert mock_api.get_submissions("A3") == [s for s in demo if s["assessment_id"] == "A3"]


# --- run gate ----------------------------------------------------------------

def test_resolve_run_passes_a_demo_test_through(pipeline: dict[str, Any]) -> None:
    assert mock_api.resolve_run("A3", "C1") == "C1"


def test_resolve_run_refuses_an_uploaded_test_without_a_key(uploaded: None) -> None:
    assert not llm.available()
    with pytest.raises(mock_api.RunRefused) as refused:
        mock_api.resolve_run(TEST_ID, "C1")
    assert (refused.value.status, refused.value.code) == (409, "AI_KEY_REQUIRED")
    assert "AI key" in refused.value.message


def test_resolve_run_returns_the_class_when_a_key_is_present(
        uploaded: None, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(llm, "available", lambda: True)
    assert mock_api.resolve_run(TEST_ID, "C1") == CLASS_ID


def test_api_refuses_an_uploaded_run_with_a_code(client: TestClient, uploaded: None) -> None:
    response = client.post("/api/batch/run", json={"assessment_id": TEST_ID, "cohort_id": CLASS_ID})
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "AI_KEY_REQUIRED"


# --- registry and the merged connector --------------------------------------

def test_registry_reads_round_trip(uploaded: None) -> None:
    assert {"class_id": CLASS_ID, "name": "Year 9 Maths", "enrolled": 2} in registry.list_classes()
    assert TEST_ID in [t["assessment_id"] for t in registry.list_tests()]
    assert registry.get_test(TEST_ID)["questions"][1]["question_id"] == "U98Q02"
    assert registry.get_test("U99") is None
    assert registry.class_learners(CLASS_ID) == [{"learner_id": l, "name": n} for l, n in LEARNERS]
    answers = registry.list_answers(TEST_ID)
    assert len(answers) == 4
    assert answers[0] == {
        "submission_id": "U98-C98-S01-U98Q01", "learner_id": "C98-S01", "learner_name": "Ada L.",
        "assessment_id": TEST_ID, "question_id": "U98Q01", "topic": "T1", "type": "mcq",
        "answer": "3/4", "selected_option": "b", "submitted_at": "2026-09-02T09:00:00Z"}
    assert registry.list_answers("U99") == []


def test_registry_reads_are_empty_before_the_tables_exist(
        tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """The LMS connector runs from paths that never called init_db."""
    bare = tmp_path / "bare.db"
    monkeypatch.setattr(db, "DB_PATH", bare)
    assert registry.list_classes() == [] and registry.list_tests() == []
    assert registry.get_test(TEST_ID) is None and registry.class_learners(CLASS_ID) == []
    assert registry.list_answers(TEST_ID) == []
    assert len(mock_api.get_assignments("C1")) == 4 and len(mock_api.get_courses()) == 1


def test_connector_merges_an_uploaded_class(uploaded: None) -> None:
    [row] = mock_api.get_assignments(CLASS_ID)
    assert (row["id"], row["display_name"], row["source"], row["needs_ai"], row["class_id"]) == (
        TEST_ID, "Fractions check", "uploaded", True, CLASS_ID)
    assert row["points_possible"] == 3 and row["question_count"] == 2
    assert (row["submission_count"], row["expected_count"]) == (2, 2)
    assert len(mock_api.get_submissions(TEST_ID)) == 4
    assert mock_api.get_assessment_questions(TEST_ID)[0]["question_id"] == "U98Q01"
    assert mock_api.get_question("U98Q02")["max_marks"] == 2
    assert mock_api.get_question("A3Q4")["question_id"] == "A3Q4"
    assert mock_api.get_question("A9Q9") is None
    assert mock_api.cohort_id_for(TEST_ID) == CLASS_ID and mock_api.cohort_id_for("A3") == "C1"
    assert mock_api.assessments_in_class(CLASS_ID) == [TEST_ID]
    assert mock_api.assessments_in_class("C1") == ["A1", "A2", "A3", "A4"]


def test_cohort_meta_is_the_demo_class_unless_the_test_is_uploaded(uploaded: None) -> None:
    for meta in (mock_api.get_cohort_meta(), mock_api.get_cohort_meta("A3")):
        assert meta["cohort_id"] == "C1" and len(meta["learners"]) == 12
        assert meta["assessments_expected"] == ["A1", "A2", "A3", "A4"]
    meta = mock_api.get_cohort_meta(TEST_ID)
    assert meta["cohort_id"] == CLASS_ID and meta["cohort_label"] == "Year 9 Maths"
    assert meta["assessments_expected"] == [TEST_ID]
    assert [l["learner_id"] for l in meta["learners"]] == [l for l, _ in LEARNERS]
    everyone = [l["learner_id"] for l in mock_api.get_roster()]
    assert everyone[:12] == [f"L{i:02d}" for i in range(1, 13)]
    assert {l for l, _ in LEARNERS} <= set(everyone) and len(mock_api.get_roster(CLASS_ID)) == 2


# --- API ---------------------------------------------------------------------

def test_health_reports_ai_email_and_the_severity_floor(client: TestClient) -> None:
    body = client.get("/api/health").json()
    assert body["ai_available"] is False
    assert body["email_configured"] is bool(config.GMAIL_USER and config.GMAIL_APP_PASSWORD)
    assert body["thresholds"]["high_severity_floor"] == 0.75


def test_history_sums_every_mark_per_student(client: TestClient) -> None:
    from backend import service

    body = client.get("/api/insights/history", params={"course_id": "C1"}).json()
    by_id = {t["assessment_id"]: t for t in body["tests"]}
    assert {"A1", "A2", "A3"} <= set(by_id)
    assert by_id["A1"]["name"] == "Test 1" and by_id["A1"]["points_possible"] == 14
    expected: dict[str, float] = {}
    for mark in service.get_batch("B-A1-sync")["all_marks"]:
        expected[mark["learner_id"]] = expected.get(mark["learner_id"], 0.0) + mark["awarded"]
    got = {l["learner_id"]: l["awarded"] for l in by_id["A1"]["learners"]}
    submitters = {s["learner_id"] for s in mock_api.get_submissions("A1")}
    assert got == expected and set(got) == submitters
    assert all(l["provisional"] is True for l in by_id["A1"]["learners"])
    assert all(0 <= l["awarded"] <= 14 for t in body["tests"] for l in t["learners"])


def test_history_skips_courses_and_tests_with_nothing_to_show(
        client: TestClient, uploaded: None) -> None:
    assert client.get("/api/insights/history", params={"course_id": CLASS_ID}).json() == {"tests": []}
    assert client.get("/api/insights/history", params={"course_id": "C404"}).json() == {"tests": []}


def test_a_learner_is_confirmed_only_when_every_mark_is_approved() -> None:
    def mark(lid: str, qid: str, awarded: float, provisional: bool) -> dict[str, Any]:
        return {"learner_id": lid, "question_id": qid, "awarded": awarded, "provisional": provisional}

    state = {
        "all_marks": [mark("L1", "q1", 1, True), mark("L1", "q2", 1, True),
                      mark("L2", "q1", 1, True), mark("L2", "q2", 1, True)],
        # L1 has both marks approved, one of them corrected to 0.5. L2 has one
        # approved and one escalated, so it is missing from the survivors.
        "marks": [mark("L1", "q1", 0.5, False), mark("L1", "q2", 1, False),
                  mark("L2", "q1", 1, False)],
    }
    rows = {r["learner_id"]: r for r in insights._student_totals(state, {"L1": "Ana"})}
    assert rows["L1"] == {"learner_id": "L1", "name": "Ana", "awarded": 1.5, "provisional": False}
    assert rows["L2"]["awarded"] == 2 and rows["L2"]["provisional"] is True
