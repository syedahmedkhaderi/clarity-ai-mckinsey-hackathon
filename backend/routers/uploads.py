"""Teacher uploads of tests, marking schemes and answer sheets.

Bodies are JSON with each file's text inside, not multipart. The browser reads the
file and sends its text, so the backend needs no new dependency and a file never
touches the disk.

A file we cannot read at all is an HTTP error (400 or 413). A file we can read
that has something wrong in it is a normal 200 from preview, with ok false and a
list of what to fix, because the teacher is expected to fix it and try again.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field

from backend import llm, service
from backend.lms import mock_api
from backend.uploads import registry, sample, store
from backend.uploads.analyse import Analysis, analyse
from backend.uploads.validate import UploadRejected

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "uploads" / "templates"
TEMPLATE_TYPES = {"paper.csv": "text/csv", "sheets.csv": "text/csv",
                  "paper.json": "application/json", "sheet.txt": "text/plain"}


class FileIn(BaseModel):
    name: str = Field(max_length=255)
    content: str


class UploadBody(BaseModel):
    class_id: str | None = None
    class_name: str | None = None
    title: str | None = None
    paper: FileIn
    sheets: list[FileIn] = Field(default_factory=list)


def _analyse(body: UploadBody) -> Analysis:
    try:
        return analyse(class_id=body.class_id, class_name=body.class_name, title=body.title,
                       paper_file=(body.paper.name, body.paper.content),
                       sheet_files=[(f.name, f.content) for f in body.sheets])
    except UploadRejected as refused:
        raise HTTPException(refused.status, detail={"code": refused.code,
                                                    "message": refused.message})


def _created(ids: dict[str, str], created: bool) -> dict[str, Any]:
    """The response for a saved test. run_blocked_reason tells the page up front
    whether the test can be analysed yet, rather than letting Run fail later."""
    blocked = None if llm.available() else mock_api.AI_KEY_REQUIRED_MESSAGE
    return {**ids, "run_blocked_reason": blocked, "created": created}


def _save(analysis: Analysis) -> dict[str, Any]:
    if not analysis.ok or analysis.paper is None:
        raise HTTPException(422, detail={"code": "INVALID_UPLOAD",
                                         "errors": analysis.issues.errors})
    ids = store.create_test(analysis.paper, analysis.sheets, title=analysis.title,
                            class_id=analysis.class_id, class_name=analysis.class_name,
                            files=analysis.files)
    return _created(ids, True)


@router.post("/preview")
def preview(body: UploadBody) -> dict[str, Any]:
    analysis = _analyse(body)
    return {"ok": analysis.ok, "errors": analysis.issues.errors,
            "warnings": analysis.issues.warnings, "summary": analysis.summary}


@router.post("/tests", status_code=201)
def create_test(body: UploadBody) -> dict[str, Any]:
    return _save(_analyse(body))


@router.get("/tests")
def list_tests() -> list[dict[str, Any]]:
    return store.test_rows()


@router.delete("/tests/{assessment_id}")
def delete_test(assessment_id: str) -> dict[str, bool]:
    if assessment_id in [s["assessment_id"] for s in mock_api.schemes()["assessments"]]:
        raise HTTPException(400, detail={"code": "DEMO_TEST", "message":
                                         "The demo tests cannot be deleted."})
    if registry.get_test(assessment_id) is None:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message":
                                         "We could not find that test."})
    if service.has_running_batch(assessment_id):
        raise HTTPException(409, detail={"code": "RUN_IN_PROGRESS", "message":
                                         "This test is being analysed. Try again in a moment."})
    store.delete_test(assessment_id)
    service.forget_assessment(assessment_id)
    return {"deleted": True}


@router.get("/templates/{name}")
def template(name: str) -> Response:
    if name not in TEMPLATE_TYPES:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message":
                                         "We have no template with that name."})
    return Response((TEMPLATE_DIR / name).read_text(encoding="utf-8"),
                    media_type=TEMPLATE_TYPES[name],
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.post("/sample", status_code=201)
def add_sample() -> dict[str, Any]:
    existing = sample.existing_sample()
    if existing:
        return _created(existing, False)
    analysis = sample.analyse_sample()
    if not analysis.ok:
        raise HTTPException(500, detail={"code": "SAMPLE_INVALID", "message":
                                         "The sample test could not be read."})
    return _save(analysis)
