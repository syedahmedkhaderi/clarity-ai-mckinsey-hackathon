"""Builders and the sandbox fixture shared by the upload tests.

Uploads write to the same throwaway database as the demo pipeline tests, so the
sandbox empties every uploaded row before and after a test. The demo class C1 and
its tests are never touched.
"""

from __future__ import annotations

from typing import Any, Iterator

import pytest

from backend import db, service

PAPER_HEADER = ("number,type,topic,marks,question,correct,option_a,option_b,option_c,option_d,"
                "model_answer,criteria")
MCQ = "1,mcq,T1,1,Which fraction is equal to 2/4?,b,1/4,1/2,2/8,3/4,,"
WRITTEN = ('2,written,T2,3,"Add 1/3 and 1/4. Show your working.",,,,,,"4/12 + 3/12 = 7/12",'
           '"1|Finds a common denominator; 1|Converts both fractions; 1|Adds to get 7/12"')
UNTAGGED = '3,written,,2,"Say why 1/8 is small.",,,,,,"More pieces.","1|Says why; 1|Compares"'
SHEET_HEADER = "student_id,name,email,Q1,Q2,Q3"
STUDENTS = (
    'S1,Ada L.,ada@example.com,b,"4/12 + 3/12 = 7/12","More pieces."',
    'S2,Bo K.,bo@example.com,a,"1/3 + 1/4 = 2/7","Smaller."',
    'S3,Cy P.,cy@example.com,b,"7/12","Because."',
    'S4,Di R.,di@example.com,d,"2/7 km","It is small."',
)


def paper(*rows: str, header: str = PAPER_HEADER) -> str:
    return "\n".join([header, *rows]) + "\n"


def sheets(*rows: str, header: str = SHEET_HEADER) -> str:
    return "\n".join([header, *rows]) + "\n"


GOOD_PAPER = paper(MCQ, WRITTEN, UNTAGGED)
GOOD_SHEETS = sheets(*STUDENTS)


def body(paper_text: str = GOOD_PAPER, sheets_text: str | None = GOOD_SHEETS,
         **extra: Any) -> dict[str, Any]:
    """A request body for preview or save. sheets_text None sends no sheets."""
    payload: dict[str, Any] = {"class_name": "Year 9", "paper": {"name": "paper.csv",
                                                                "content": paper_text},
                               "sheets": []}
    if sheets_text is not None:
        payload["sheets"] = [{"name": "sheets.csv", "content": sheets_text}]
    payload.update(extra)
    return payload


def purge() -> None:
    with db.connect() as conn:
        for table in ("classes", "uploaded_tests", "uploaded_answers"):
            conn.execute(f"DELETE FROM {table}")
        conn.execute("DELETE FROM students WHERE origin='uploaded'")
        conn.execute("DELETE FROM overrides WHERE batch_id IN "
                     "(SELECT batch_id FROM batches WHERE assessment_id LIKE 'U%')")
        for table in ("marks", "error_profile", "batches"):
            conn.execute(f"DELETE FROM {table} WHERE assessment_id LIKE 'U%'")
    for batch_id in [b for b in service._LIVE if b.startswith("B-U")]:
        del service._LIVE[batch_id]


@pytest.fixture()
def sandbox(pipeline: dict[str, Any]) -> Iterator[None]:
    db.init_db()
    purge()
    try:
        yield
    finally:
        purge()
