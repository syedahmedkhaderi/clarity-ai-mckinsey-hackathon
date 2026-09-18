"""Drafting and sending a note to a student, and the student contact list.

Sending is not an approval. Nothing here reads or writes a mark's provisional
flag, so a note can go out while every mark is still a draft.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend import service
from backend.mailbox import compose, guard, store, transport

router = APIRouter(prefix="/api", tags=["email"])


class DraftRequest(BaseModel):
    batch_id: str
    learner_id: str


class SendRequest(BaseModel):
    batch_id: str
    learner_id: str
    to: str | None = None
    subject: str
    body: str
    resend: bool = False


class TestCopyRequest(BaseModel):
    subject: str
    body: str


class StudentUpdate(BaseModel):
    email: str


def _fail(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status, detail={"code": code, "message": message})


def _batch(batch_id: str) -> dict[str, Any]:
    batch = service.get_batch(batch_id)
    if batch is None:
        raise _fail(404, "BATCH_NOT_FOUND", "That batch could not be found.")
    return batch


def _student(learner_id: str) -> dict[str, Any]:
    student = store.get_student(learner_id)
    if student is None:
        raise _fail(404, "STUDENT_NOT_FOUND", "That student could not be found.")
    return student


def _require_valid(address: str) -> str:
    address = (address or "").strip()
    if not address:
        raise _fail(422, "BAD_EMAIL", "This student has no email address yet. Add one first.")
    if not transport.is_valid_address(address):
        raise _fail(422, "BAD_EMAIL", "That email address does not look right.")
    return address


def _require_text(subject: str, body: str) -> None:
    if not subject.strip() or not body.strip():
        raise _fail(422, "EMPTY_MESSAGE", "Add a subject and a message before sending.")


def _result(email_id: int, outcome: transport.Result) -> dict[str, Any]:
    return {"email_id": email_id, "status": outcome.status, "reason": outcome.reason,
            "message": outcome.message}


@router.get("/email/status")
def email_status() -> dict[str, Any]:
    return transport.status()


@router.get("/students")
def list_students(class_id: str | None = None) -> list[dict[str, Any]]:
    return store.list_students(class_id or None)


@router.put("/students/{learner_id}")
def update_student(learner_id: str, req: StudentUpdate) -> dict[str, Any]:
    _student(learner_id)
    email = req.email.strip()
    if email and not transport.is_valid_address(email):
        raise _fail(422, "BAD_EMAIL", "That email address does not look right.")
    return store.set_email(learner_id, email) or _student(learner_id)


@router.post("/email/draft")
def draft(req: DraftRequest) -> dict[str, Any]:
    batch = _batch(req.batch_id)
    student = _student(req.learner_id)
    composed = compose.compose(batch, req.learner_id, student["name"])
    if composed is None:
        raise _fail(404, "NO_FINDINGS", "No findings for this student.")
    return {"learner_id": req.learner_id, "name": student["name"], "to": student["email"],
            **composed}


@router.post("/email/send")
def send(req: SendRequest) -> dict[str, Any]:
    batch = _batch(req.batch_id)
    student = _student(req.learner_id)
    to = _require_valid(req.to if req.to is not None else student["email"])
    _require_text(req.subject, req.body)
    try:
        guard.check(req.subject, req.body, batch.get("all_marks") or [], req.learner_id,
                    compose.evidence_spans(batch, req.learner_id))
    except guard.GuardError as exc:
        raise _fail(422, exc.code, exc.message) from exc
    if not req.resend and store.already_sent(req.batch_id, req.learner_id):
        raise _fail(409, "ALREADY_SENT",
                    f"A note about {compose.test_name(batch.get('assessment_id', ''))} has "
                    f"already gone to {student['name']}. Send it again only if you mean to.")
    outcome = transport.deliver(to, req.subject, req.body)
    email_id = store.add_sent(req.batch_id, req.learner_id, store.STUDENT, to, req.subject,
                              req.body, outcome.status, outcome.reason)
    return _result(email_id, outcome)


@router.post("/email/test-copy")
def test_copy(req: TestCopyRequest) -> dict[str, Any]:
    _require_text(req.subject, req.body)
    try:
        guard.check(req.subject, req.body)
    except guard.GuardError as exc:
        raise _fail(422, exc.code, exc.message) from exc
    to = transport.status()["sender"] or ""
    outcome = transport.deliver(str(to), req.subject, req.body)
    email_id = store.add_sent("", "", store.TEST_COPY, str(to), req.subject, req.body,
                              outcome.status, outcome.reason)
    return _result(email_id, outcome)


@router.get("/email/sent")
def sent(batch_id: str | None = None) -> list[dict[str, Any]]:
    return store.list_sent(batch_id or None)
