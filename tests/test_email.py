"""Drafting, guarding, delivering and recording a note to a student.

No test here can send real mail: smtplib.SMTP_SSL is replaced wherever Gmail is
made to look configured, and the credentials are monkeypatched, never read from
the environment. Students' addresses that a test edits are restored afterwards.
"""

from __future__ import annotations

import re
import smtplib
from typing import Any, Iterator

import pytest
from fastapi.testclient import TestClient

from backend import config, service
from backend.api import app
from backend.lms import mock_api
from backend.mailbox import compose, guard, store, transport

DEMO_EMAIL = re.compile(r"^[a-z]+\.[a-z]@example\.com$")
NODE_ID = re.compile(r"\bM\d{2}\b")


@pytest.fixture(scope="module")
def client(pipeline: dict[str, Any]) -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="module")
def batch_id(pipeline: dict[str, Any]) -> str:
    return pipeline["batch_id"]


@pytest.fixture()
def student(pipeline: dict[str, Any]) -> Iterator[str]:
    """A diagnosed student whose address is put back after the test."""
    learner_id = compose_targets(pipeline)[0]
    original = store.get_student(learner_id)["email"]
    yield learner_id
    store.set_email(learner_id, original)
    with store.db.connect() as conn:
        conn.execute("DELETE FROM sent_emails")


def compose_targets(pipeline: dict[str, Any]) -> list[str]:
    return sorted({d["learner_id"] for d in pipeline["diagnoses"] if d["taxonomy_node"]})


@pytest.fixture()
def gmail(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    """Gmail looks configured and SMTP_SSL is a recorder, so nothing leaves the machine."""
    sent: list[dict[str, Any]] = []

    class FakeSMTP:
        def __init__(self, host: str, port: int, timeout: int = 0, **_: Any) -> None:
            sent.append({"host": host, "port": port, "timeout": timeout})

        def __enter__(self) -> "FakeSMTP":
            return self

        def __exit__(self, *_: Any) -> None:
            return None

        def login(self, user: str, password: str) -> None:
            sent[-1]["login"] = (user, password)

        def send_message(self, msg: Any) -> dict[str, Any]:
            sent[-1]["to"], sent[-1]["subject"] = msg["To"], msg["Subject"]
            sent[-1]["body"] = msg.get_content()
            return {}

    monkeypatch.setattr(config, "GMAIL_USER", "teacher@gmail.com")
    monkeypatch.setattr(config, "GMAIL_APP_PASSWORD", "app-password-1234")
    monkeypatch.setattr(smtplib, "SMTP_SSL", FakeSMTP)
    return sent


def _send(client: TestClient, batch_id: str, learner_id: str, **over: Any) -> Any:
    body = {"batch_id": batch_id, "learner_id": learner_id, "to": "kid@school.org.uk",
            "subject": "Next steps after Mid-term", "body": "Hi,\n\nPlease look at question 4."}
    return client.post("/api/email/send", json={**body, **over})


def test_every_demo_draft_is_clean(client: TestClient, batch_id: str,
                                   pipeline: dict[str, Any]) -> None:
    learners = compose_targets(pipeline)
    assert len(learners) >= 10
    for learner_id in learners:
        res = client.post("/api/email/draft", json={"batch_id": batch_id, "learner_id": learner_id})
        assert res.status_code == 200, res.text
        data = res.json()
        text = f"{data['subject']}\n{data['body']}"
        assert not NODE_ID.search(text), (learner_id, text)
        guard.check(data["subject"], data["body"], pipeline["all_marks"], learner_id,
                    compose.evidence_spans(pipeline, learner_id))
        assert data["subject"] == "Next steps after Mid-term"
        assert data["body"].startswith("Hi ") and data["body"].endswith("Your teacher")
        assert "Where we saw it" in data["body"]
        assert "facilitator" not in text.lower()
        assert DEMO_EMAIL.match(data["to"]), data["to"]
        for obs in data["observations"]:
            assert obs["test"] == "Mid-term" and obs["question_number"] >= 1
            assert f"{obs['test']}, Question {obs['question_number']}: {obs['area']}" in data["body"]


def test_draft_has_no_mark_fractions(client: TestClient, batch_id: str,
                                     pipeline: dict[str, Any]) -> None:
    for learner_id in compose_targets(pipeline):
        body = client.post("/api/email/draft", json={
            "batch_id": batch_id, "learner_id": learner_id}).json()["body"]
        for a, m in guard.mark_strings(pipeline["all_marks"], learner_id):
            assert f"{a}/{m}" not in body and f"{a} out of {m}" not in body
        assert "provisional" not in body.lower()


def test_draft_404s(client: TestClient, batch_id: str) -> None:
    assert client.post("/api/email/draft", json={
        "batch_id": "nope", "learner_id": "L01"}).status_code == 404
    assert client.post("/api/email/draft", json={
        "batch_id": batch_id, "learner_id": "ZZ99"}).status_code == 404
    with store.db.connect() as conn:
        conn.execute("INSERT INTO students VALUES ('C97-S01','C97','S01','No Findings','','uploaded')")
    try:
        res = client.post("/api/email/draft", json={"batch_id": batch_id, "learner_id": "C97-S01"})
        assert res.status_code == 404
        assert res.json()["detail"]["code"] == "NO_FINDINGS"
    finally:
        with store.db.connect() as conn:
            conn.execute("DELETE FROM students WHERE learner_id='C97-S01'")


def test_wording_diagnosis_never_blames_the_maths() -> None:
    batch = {"assessment_id": "A3", "diagnoses": [{
        "learner_id": "L01", "question_id": "A3Q4", "taxonomy_node": "M01", "topic": "T2",
        "error_class": "conceptual", "language_flag": True, "evidence_span": "x"}]}
    (obs,) = compose.observations(batch, "L01")
    assert obs["pattern"] == compose.WORDING_PATTERN
    assert obs["question_number"] == 4 and obs["area"].startswith("Fractions")


def test_uploaded_question_numbers_and_test_name() -> None:
    assert compose.question_number("A3Q4") == 4
    assert compose.question_number("U01Q04") == 4
    assert compose.test_name("A3") == "Mid-term"


def test_guard_node_ids() -> None:
    for text in ("This is M01.", "see m24 here", "(M07)"):
        with pytest.raises(guard.GuardError) as err:
            guard.check("Subject", text)
        assert err.value.code == "NODE_ID_IN_TEXT"
    guard.check("Subject", "The room M0 and MM01 and M250 are fine, so is M25.")


def test_guard_marks() -> None:
    marks = [{"learner_id": "L01", "awarded": 2.0, "max_marks": 3.0},
             {"learner_id": "L01", "awarded": 1.0, "max_marks": 1.0},
             {"learner_id": "L02", "awarded": 0.0, "max_marks": 4.0}]
    for text in ("You got 2/3.", "2 out of 3 was close", "That is 2 of 3", "2 / 3", "3/4 overall"):
        with pytest.raises(guard.GuardError) as err:
            guard.check("Subject", text, marks, "L01")
        assert err.value.code == "MARKS_IN_TEXT"
    for text in ("12/30 is unrelated", "1/2 + 1/4", "0/4 belongs to someone else", "2/3/4"):
        guard.check("Subject", text, marks, "L01")
    with pytest.raises(guard.GuardError):
        guard.check("You scored 2/3", "Hello", marks, "L01")


def test_guard_allows_a_fraction_the_student_wrote() -> None:
    marks = [{"learner_id": "L01", "awarded": 1.0, "max_marks": 2.0}]
    text = 'In your answer you wrote "1/2". Next step: check the denominator.'
    with pytest.raises(guard.GuardError):
        guard.check("S", text, marks, "L01")
    guard.check("S", text, marks, "L01", quoted=["1/2"])


def test_send_guard_over_http(client: TestClient, batch_id: str, student: str,
                              pipeline: dict[str, Any]) -> None:
    res = _send(client, batch_id, student, body="Look at M01 again.")
    assert res.status_code == 422 and res.json()["detail"]["code"] == "NODE_ID_IN_TEXT"
    a, m = guard.mark_strings(pipeline["all_marks"], student)[0]
    res = _send(client, batch_id, student, body=f"You got {a}/{m}.")
    assert res.status_code == 422 and res.json()["detail"]["code"] == "MARKS_IN_TEXT"
    assert store.list_sent(batch_id) == []


def test_unset_gmail_saves_and_says_so(client: TestClient, batch_id: str, student: str,
                                       monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "GMAIL_USER", "")
    monkeypatch.setattr(config, "GMAIL_APP_PASSWORD", "")
    assert client.get("/api/email/status").json() == {
        "gmail_configured": False, "sender": None, "delivery": "save_only"}
    res = _send(client, batch_id, student)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "saved"
    assert data["message"] == "Saved, not delivered. Gmail is not set up."
    (row,) = client.get(f"/api/email/sent?batch_id={batch_id}").json()
    assert row["status"] == "saved" and row["kind"] == "student" and row["name"]


def test_delivered_through_a_fake_smtp(client: TestClient, batch_id: str, student: str,
                                       gmail: list[dict[str, Any]]) -> None:
    assert client.get("/api/email/status").json() == {
        "gmail_configured": True, "sender": "teacher@gmail.com", "delivery": "gmail"}
    res = _send(client, batch_id, student, body="Café note: look at question 4.")
    assert res.status_code == 200 and res.json()["status"] == "delivered"
    (call,) = gmail
    assert (call["host"], call["port"], call["timeout"]) == (
        config.SMTP_HOST, config.SMTP_PORT, config.SMTP_TIMEOUT_SECONDS)
    assert call["login"] == ("teacher@gmail.com", "app-password-1234")
    assert call["to"] == "kid@school.org.uk"
    assert call["subject"] == "Next steps after Mid-term"
    assert "Café note" in call["body"]


def test_reserved_addresses_never_touch_smtp(client: TestClient, batch_id: str, student: str,
                                             gmail: list[dict[str, Any]]) -> None:
    for i, address in enumerate(("a@example.com", "a@Example.ORG", "a@school.test",
                                 "a@mail.invalid", "a@x.example")):
        res = _send(client, batch_id, student, to=address, resend=True)
        data = res.json()
        assert data["status"] == "saved" and data["reason"] == "demo address", address
        assert data["message"] == "Saved, not delivered. This is a demo address."
    assert gmail == []
    assert not transport.is_reserved("a@example.com.au")


@pytest.mark.parametrize("exc,fragment", [
    (smtplib.SMTPAuthenticationError(535, b"bad credentials"), "sign-in"),
    (smtplib.SMTPRecipientsRefused({"a@b.co": (550, b"no")}), "refused"),
    (OSError("timed out"), "reach Gmail"),
    (RuntimeError("boom"), "could not send"),
])
def test_smtp_failure_is_friendly(client: TestClient, batch_id: str, student: str,
                                  gmail: list[dict[str, Any]], monkeypatch: pytest.MonkeyPatch,
                                  exc: Exception, fragment: str) -> None:
    class Broken:
        def __init__(self, *_: Any, **__: Any) -> None:
            raise exc

    monkeypatch.setattr(smtplib, "SMTP_SSL", Broken)
    res = _send(client, batch_id, student)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "failed" and fragment in data["reason"]
    assert data["message"].startswith("Not sent.")
    assert "app-password-1234" not in res.text and "Traceback" not in res.text
    (row,) = store.list_sent(batch_id)
    assert row["status"] == "failed"


def test_second_send_needs_resend_but_failed_does_not_block(
        client: TestClient, batch_id: str, student: str, gmail: list[dict[str, Any]]) -> None:
    assert _send(client, batch_id, student).status_code == 200
    second = _send(client, batch_id, student)
    assert second.status_code == 409 and second.json()["detail"]["code"] == "ALREADY_SENT"
    assert _send(client, batch_id, student, resend=True).json()["status"] == "delivered"
    assert len(gmail) == 2


def test_failed_send_can_be_retried_without_resend(
        client: TestClient, batch_id: str, student: str, gmail: list[dict[str, Any]],
        monkeypatch: pytest.MonkeyPatch) -> None:
    working = smtplib.SMTP_SSL

    class Broken:
        def __init__(self, *_: Any, **__: Any) -> None:
            raise OSError("down")

    monkeypatch.setattr(smtplib, "SMTP_SSL", Broken)
    assert _send(client, batch_id, student).json()["status"] == "failed"
    monkeypatch.setattr(smtplib, "SMTP_SSL", working)
    assert _send(client, batch_id, student).json()["status"] == "delivered"


def test_send_needs_a_valid_recipient_and_text(client: TestClient, batch_id: str,
                                               student: str) -> None:
    for bad in ("not-an-address", "a b@c.com", "a@b"):
        res = _send(client, batch_id, student, to=bad)
        assert res.status_code == 422 and res.json()["detail"]["code"] == "BAD_EMAIL", bad
    store.set_email(student, "")
    res = client.post("/api/email/send", json={
        "batch_id": batch_id, "learner_id": student, "subject": "S", "body": "B"})
    assert res.status_code == 422 and res.json()["detail"]["code"] == "BAD_EMAIL"
    assert _send(client, batch_id, student, subject="  ").status_code == 422
    assert _send(client, "nope", student).status_code == 404
    assert _send(client, batch_id, "ZZ99").status_code == 404


def test_send_uses_the_stored_address_by_default(client: TestClient, batch_id: str, student: str,
                                                 gmail: list[dict[str, Any]]) -> None:
    store.set_email(student, "stored@school.org.uk")
    res = client.post("/api/email/send", json={
        "batch_id": batch_id, "learner_id": student, "subject": "S", "body": "B"})
    assert res.json()["status"] == "delivered" and gmail[0]["to"] == "stored@school.org.uk"


def test_sending_never_changes_a_mark(client: TestClient, batch_id: str, student: str,
                                      gmail: list[dict[str, Any]]) -> None:
    before = [m["provisional"] for m in service.get_batch(batch_id)["all_marks"]]
    _send(client, batch_id, student)
    after = [m["provisional"] for m in service.get_batch(batch_id)["all_marks"]]
    assert before == after and all(before)


def test_test_copy(client: TestClient, gmail: list[dict[str, Any]],
                   monkeypatch: pytest.MonkeyPatch) -> None:
    res = client.post("/api/email/test-copy", json={"subject": "Copy", "body": "Hello"})
    assert res.json()["status"] == "delivered" and gmail[0]["to"] == "teacher@gmail.com"
    assert client.post("/api/email/test-copy", json={
        "subject": "Copy", "body": "About M03"}).status_code == 422
    monkeypatch.setattr(config, "GMAIL_USER", "")
    res = client.post("/api/email/test-copy", json={"subject": "Copy", "body": "Hello"})
    assert res.json()["status"] == "saved"
    rows = [r for r in client.get("/api/email/sent").json() if r["kind"] == "test_copy"]
    assert len(rows) == 2 and rows[0]["batch_id"] == ""
    with store.db.connect() as conn:
        conn.execute("DELETE FROM sent_emails")


def test_students_list_and_edit(client: TestClient, student: str) -> None:
    everyone = client.get("/api/students").json()
    assert len(everyone) >= 12 and {"learner_id", "class_id", "name", "email", "origin"} <= set(everyone[0])
    demo = client.get("/api/students?class_id=C1").json()
    assert {s["learner_id"] for s in demo} >= {f"L{i:02d}" for i in range(1, 13)}
    assert client.get("/api/students?class_id=NOPE").json() == []

    res = client.put(f"/api/students/{student}", json={"email": " new.name@school.org.uk "})
    assert res.status_code == 200 and res.json()["email"] == "new.name@school.org.uk"
    assert store.get_student(student)["email"] == "new.name@school.org.uk"
    assert client.put(f"/api/students/{student}", json={"email": ""}).json()["email"] == ""
    bad = client.put(f"/api/students/{student}", json={"email": "nope"})
    assert bad.status_code == 422 and bad.json()["detail"]["code"] == "BAD_EMAIL"
    assert client.put("/api/students/ZZ99", json={"email": "a@b.co"}).status_code == 404


def test_demo_class_contacts_are_untouched_by_these_tests(client: TestClient) -> None:
    demo = client.get("/api/students?class_id=C1").json()
    assert all(DEMO_EMAIL.match(s["email"]) for s in demo)
    assert mock_api.get_assignments("C1")[2]["display_name"] == "Mid-term"


def _batch_with_body(body: str) -> dict[str, Any]:
    return {
        "assessment_id": "A3",
        "diagnoses": [{"learner_id": "L01", "question_id": "A3Q4", "taxonomy_node": "M01",
                       "topic": "T2", "error_class": "conceptual", "language_flag": False,
                       "evidence_span": "3/7"}],
        "all_marks": [{"learner_id": "L01", "awarded": 2.0, "max_marks": 3.0}],
        "plan": {"feedback": [{"learner_id": "L01", "body": body}]},
    }


def test_model_body_that_leaks_falls_back() -> None:
    for leaky in ("This is the M01 pattern. Try again.", "You got 2 out of 3 on it.",
                  "Thabo M., you scored 2/3 here."):
        text = compose.compose(_batch_with_body(leaky), "L01", "Thabo M.")["body"]
        assert compose.NO_BODY_FALLBACK in text
        assert "M01" not in text and "2/3" not in text and "2 out of 3" not in text
    ok = compose.compose(_batch_with_body('You wrote "3/7". Try again.'), "L01", "Thabo M.")
    assert '"3/7"' in ok["body"] and compose.NO_BODY_FALLBACK not in ok["body"]


def test_a_greeting_in_the_body_is_not_repeated() -> None:
    for body in ("Hi Thabo, a note here.", "Dear Thabo M., a note here.",
                 "Hello Thabo: a note here.", "Thabo M., a note here."):
        text = compose.compose(_batch_with_body(body), "L01", "Thabo M.")["body"]
        assert text.count("Hi ") + text.count("Dear") + text.count("Hello") == 1, text
        assert "\n\nA note here.\n\n" in text
