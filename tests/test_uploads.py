"""Teacher uploads: parsing, validation, storage, deletion, the sample and the API.

Everything runs offline against the throwaway database. The sandbox fixture
empties every uploaded row around each test, so the demo class and the pipeline
tests never see what is written here.
"""

from __future__ import annotations

import json
from typing import Any, Iterator

import pytest
from fastapi.testclient import TestClient
from upload_helpers import (GOOD_PAPER, GOOD_SHEETS, MCQ, SHEET_HEADER, STUDENTS, body, paper,
                            sandbox, sheets)

from backend import config, db, llm, service
from backend.api import app
from backend.lms import mock_api
from backend.uploads import registry, sample, store
from backend.uploads.analyse import Analysis, analyse

__all__ = ["sandbox"]


@pytest.fixture(scope="module")
def client(pipeline: dict[str, Any]) -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


def run(paper_text: str = GOOD_PAPER, sheets_text: str | None = GOOD_SHEETS,
        **kwargs: Any) -> Analysis:
    files = [("sheets.csv", sheets_text)] if sheets_text is not None else []
    return analyse(class_id=kwargs.get("class_id"), class_name=kwargs.get("class_name", "Year 9"),
                   title=None, paper_file=("paper.csv", paper_text), sheet_files=files)


def messages(items: list[dict[str, str]]) -> str:
    return " | ".join(f"{i['where']}: {i['message']}" for i in items)


# --- the paper ------------------------------------------------------------------

def test_a_good_paper_and_sheets_have_no_errors_and_no_warnings(sandbox: None) -> None:
    result = run()
    assert result.ok and result.issues.errors == []
    # The untagged third question is the only thing worth a warning.
    assert len(result.issues.warnings) == 1 and "Question 3 has no topic" in messages(
        result.issues.warnings)
    assert result.summary == {
        "title": "Paper", "question_count": 3, "total_marks": 6, "student_count": 4,
        "blank_answers": 0, "untagged_questions": 1, "new_students": 4, "needs_ai": True,
        "topics": [{"id": "T1", "label": "Fractions - equivalence and simplification", "count": 1},
                   {"id": "T2", "label": "Fractions - addition and subtraction with unlike "
                                         "denominators", "count": 1}]}


@pytest.mark.parametrize("bad_row, fragment", [
    ("1,essay,T1,1,What?,,,,,,,", "must be 'mcq' or 'written'"),
    ("1,mcq,T1,0,Which?,b,x,y,,,,", "marks must be a number above zero"),
    ("1,mcq,T1,many,Which?,b,x,y,,,,", "marks must be a number above zero"),
    ("1,mcq,Algebra,1,Which?,b,x,y,,,,", "don't recognise the topic 'Algebra'"),
    ("1,mcq,T1,1,Which?,e,x,y,,,,", "'e' is not one of the options"),
    ("1,mcq,T1,1,Which?,c,x,y,,,,", "'c' is not one of the options"),
    ("1,mcq,T1,1,Which?,a,x,,,,,", "fewer than two options"),
    ("1,mcq,T1,1,,b,x,y,,,,", "has no question text"),
    ("x,mcq,T1,1,Which?,b,x,y,,,,", "number is missing or is not a whole number"),
    ('1,written,T1,3,"Q?",,,,,,"A","1|One; 1|Two"', "add up to 2 marks but the question is worth 3"),
    ('1,written,T1,2,"Q?",,,,,,"A","1|One; 3|Two"', "add up to 4 marks but the question is worth 2"),
    ('1,written,T1,2,"Q?",,,,,,"A","One mark for it"', "each criterion needs marks"),
    ('1,written,T1,2,"Q?",,,,,,,', "neither marking criteria nor a model answer"),
])
def test_paper_row_errors_are_specific(bad_row: str, fragment: str, sandbox: None) -> None:
    result = run(paper(bad_row))
    assert not result.ok
    assert fragment in messages(result.issues.errors)
    assert result.issues.errors[0]["file"] == "paper.csv"
    assert result.issues.errors[0]["where"].startswith("Row 2")


def test_paper_errors_name_the_row_and_column(sandbox: None) -> None:
    result = run(paper(MCQ, "2,mcq,T1,1,Which?,z,x,y,,,,"))
    [error] = result.issues.errors
    assert error["where"] == "Row 3, correct"


def test_a_missing_paper_column_is_one_clear_error(sandbox: None) -> None:
    result = run("number,type,question\n1,mcq,What?\n")
    [error] = result.issues.errors
    assert error["where"] == "Row 1" and "'marks'" in error["message"]


def test_duplicate_question_numbers_are_an_error(sandbox: None) -> None:
    result = run(paper(MCQ, MCQ))
    assert "Question 1 is already used on Row 2" in messages(result.issues.errors)


def test_a_paper_with_no_questions_is_an_error(sandbox: None) -> None:
    assert "No questions were found" in messages(run(paper()).issues.errors)


def test_topic_accepts_an_id_the_exact_label_or_blank_for_untagged(sandbox: None) -> None:
    label = "fractions - addition and subtraction with unlike denominators"
    rows = (f"1,mcq,{label},1,A?,a,x,y,,,,", "2,mcq,t1,1,B?,a,x,y,,,,", "3,mcq,other,1,C?,a,x,y,,,,",
            "4,mcq,,1,D?,a,x,y,,,,")
    result = run(paper(*rows))
    assert [e for e in result.issues.errors if e["file"] == "paper.csv"] == []
    assert [q.topic for q in result.paper.questions] == ["T2", "T1", "", ""]


def test_number_prefixes_and_semicolon_delimiters_are_accepted(sandbox: None) -> None:
    text = paper("Q1;mcq;T1;1;Which?;b;x;y;;;;", header=PAPER_SEMICOLON)
    result = run(text)
    assert result.ok and result.paper.questions[0].number == 1


PAPER_SEMICOLON = ("number;type;topic;marks;question;correct;option_a;option_b;option_c;"
                   "option_d;model_answer;criteria")


def test_unused_paper_columns_are_a_warning_not_an_error(sandbox: None) -> None:
    result = run(paper(MCQ + ",hard", header=PAPER_HEADER_EXTRA))
    assert result.ok and "will be ignored: difficulty" in messages(result.issues.warnings)


PAPER_HEADER_EXTRA = ("number,type,topic,marks,question,correct,option_a,option_b,option_c,"
                      "option_d,model_answer,criteria,difficulty")


def test_a_written_question_without_criteria_gets_one_for_the_model_answer(sandbox: None) -> None:
    result = run(paper('1,written,T1,2,"Q?",,,,,,"The answer",'))
    assert result.ok
    assert result.paper.questions[0].scheme == [
        {"marks": 2, "criterion": "Gives an answer that matches the model answer"}]
    assert "has no criteria" in messages(result.issues.warnings)


def test_a_written_question_without_a_model_answer_warns(sandbox: None) -> None:
    result = run(paper('1,written,T1,2,"Q?",,,,,,,"2|Correct"'))
    assert result.ok and "no model answer" in messages(result.issues.warnings)


def test_a_json_paper_reads_the_same_as_csv(sandbox: None) -> None:
    payload = {"title": "Quick check", "questions": [
        {"number": 1, "type": "mcq", "topic": "T1", "marks": 1, "question": "Which?",
         "options": ["x", "y"], "correct": "b"},
        {"number": 2, "type": "written", "topic": "Fractions - equivalence and simplification",
         "marks": 2, "question": "Why?", "model_answer": "Because.",
         "criteria": [{"marks": 1, "text": "Reason"}, {"marks": 1, "text": "Example"}]}]}
    result = analyse(class_id=None, class_name="Y", title=None,
                     paper_file=("q.json", json.dumps(payload)), sheet_files=[])
    assert result.paper is not None and result.issues.errors == [
        {"file": "Answer sheets", "where": "whole upload", "message": "Add at least one answer sheet."}]
    q1, q2 = result.paper.questions
    assert (result.title, q1.correct, q1.options, q2.topic) == (
        "Quick check", "b", {"a": "x", "b": "y"}, "T1")
    assert q2.scheme == [{"marks": 1, "criterion": "Reason"}, {"marks": 1, "criterion": "Example"}]


def test_invalid_json_is_reported_with_its_position(sandbox: None) -> None:
    result = analyse(class_id=None, class_name="Y", title=None,
                     paper_file=("q.json", '{"questions": ['), sheet_files=[])
    assert "not valid JSON" in messages(result.issues.errors)


def test_too_many_questions_is_an_error(sandbox: None, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "UPLOAD_MAX_QUESTIONS", 2)
    assert "The most we can take is 2" in messages(run().issues.errors)


# --- the answer sheets -----------------------------------------------------------

def test_a_missing_question_column_is_an_error(sandbox: None) -> None:
    result = run(sheets_text=sheets(*(s.rsplit(",", 1)[0] for s in STUDENTS),
                                    header="student_id,name,email,Q1,Q2"))
    assert "There is no column for question 3" in messages(result.issues.errors)


def test_extra_sheet_columns_are_warnings(sandbox: None) -> None:
    result = run(sheets_text=sheets(*(s + ",x,y" for s in STUDENTS),
                                    header=SHEET_HEADER + ",Q4,notes"))
    assert result.ok
    text = messages(result.issues.warnings)
    assert "Question 4 is not on the test" in text and "will be ignored: notes" in text


def test_duplicate_student_ids_are_an_error(sandbox: None) -> None:
    result = run(sheets_text=sheets(*STUDENTS, 'S1,Ada again,,b,"x","y"'))
    [error] = result.issues.errors
    assert error["where"] == "Row 6" and "'S1' is already used" in error["message"]


def test_duplicate_ids_are_found_across_files(sandbox: None) -> None:
    one = "Student: S1\nName: Ada\nQ1: b\nQ2: x\nQ3: y\n"
    result = analyse(class_id=None, class_name="Y", title=None, paper_file=("p.csv", GOOD_PAPER),
                     sheet_files=[("a.txt", one), ("b.txt", one.replace("Ada", "Ada2"))])
    assert "already used in a.txt" in messages(result.issues.errors)


def test_a_bad_email_is_a_warning_and_is_not_saved(sandbox: None) -> None:
    result = run(sheets_text=sheets(STUDENTS[0].replace("ada@example.com", "ada@"), *STUDENTS[1:]))
    assert result.ok and "'ada@' does not look like an email" in messages(result.issues.warnings)
    assert result.sheets[0].email == ""


def test_blank_answers_are_counted_and_warned(sandbox: None) -> None:
    rows = ('S1,Ada L.,,b,,"x"', 'S2,Bo K.,,,,', *STUDENTS[2:])
    result = run(sheets_text=sheets(*rows))
    assert result.ok and result.summary["blank_answers"] == 4
    text = messages(result.issues.warnings)
    assert "Ada L. left question 2 blank" in text and "Bo K. left questions 1, 2 and 3 blank" in text


def test_fewer_than_four_students_is_a_warning(sandbox: None) -> None:
    result = run(sheets_text=sheets(*STUDENTS[:3]))
    assert result.ok and "Only 3 students" in messages(result.issues.warnings)


def test_no_sheets_is_an_error(sandbox: None) -> None:
    assert "Add at least one answer sheet" in messages(run(sheets_text=None).issues.errors)


def test_an_unrecognised_multiple_choice_answer_is_a_warning(sandbox: None) -> None:
    result = run(sheets_text=sheets(STUDENTS[0].replace(",b,", ",zebra,", 1), *STUDENTS[1:]))
    assert result.ok and "('zebra') is not one of the options" in messages(result.issues.warnings)


def test_semicolon_csv_sheets_are_read(sandbox: None) -> None:
    text = "student_id;name;email;Q1;Q2;Q3\n" + "\n".join(
        f"S{i};Name {i};;b;x;y" for i in range(1, 5))
    result = run(sheets_text=text)
    assert result.ok and result.summary["student_count"] == 4


def test_a_bad_encoding_is_reported_not_crashed_on(sandbox: None) -> None:
    result = run(sheets_text="student_id,name\nS1,Zo\ufffd\n")
    assert "characters we can't read" in messages(result.issues.errors)


def test_text_sheets_read_multi_line_answers_and_markdown_labels(sandbox: None) -> None:
    text = ("**Student:** S9\n**Name:** Eve M.\nEmail: eve@example.com\n\n"
            "Q1: b\nQ2: 1/3 + 1/4\nfirst find twelfths\n= 7/12 km\n\n"
            "**Q3:** More pieces.\n")
    result = analyse(class_id=None, class_name="Y", title=None, paper_file=("p.csv", GOOD_PAPER),
                     sheet_files=[("eve.md", text)])
    [sheet] = result.sheets
    assert (sheet.ref, sheet.name, sheet.email) == ("S9", "Eve M.", "eve@example.com")
    assert sheet.answers == {1: "b", 2: "1/3 + 1/4\nfirst find twelfths\n= 7/12 km",
                             3: "More pieces."}


def test_one_text_file_can_hold_several_students(sandbox: None) -> None:
    text = "".join(f"Student: S{i}\nName: N{i}\nQ1: b\nQ2: x\nQ3: y\n\n" for i in range(1, 5))
    result = analyse(class_id=None, class_name="Y", title=None, paper_file=("p.csv", GOOD_PAPER),
                     sheet_files=[("all.txt", text)])
    assert result.ok and [s.ref for s in result.sheets] == ["S1", "S2", "S3", "S4"]


def test_answers_before_any_student_line_are_an_error(sandbox: None) -> None:
    result = analyse(class_id=None, class_name="Y", title=None, paper_file=("p.csv", GOOD_PAPER),
                     sheet_files=[("x.txt", "Q1: b\nQ2: x\n")])
    assert "can't tell whose they are" in messages(result.issues.errors)


def test_a_question_nobody_answered_in_text_sheets_is_an_error(sandbox: None) -> None:
    files = [(f"s{i}.txt", f"Student: S{i}\nName: N{i}\nQ1: b\nQ2: x\n") for i in range(1, 4)]
    result = analyse(class_id=None, class_name="Y", title=None, paper_file=("p.csv", GOOD_PAPER),
                     sheet_files=files)
    assert "No student has an answer for question 3" in messages(result.issues.errors)


def test_json_sheets_are_read(sandbox: None) -> None:
    students = [{"student_id": f"S{i}", "name": f"N{i}", "answers": {"Q1": "b", "2": "x", "Q3": "y"}}
                for i in range(1, 5)]
    result = analyse(class_id=None, class_name="Y", title=None, paper_file=("p.csv", GOOD_PAPER),
                     sheet_files=[("s.json", json.dumps({"students": students}))])
    assert result.ok and result.sheets[3].answers == {1: "b", 2: "x", 3: "y"}


def test_student_and_test_limits(sandbox: None, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "UPLOAD_MAX_STUDENTS", 3)
    assert "The most we can take is 3" in messages(run().issues.errors)
    monkeypatch.setattr(config, "UPLOAD_MAX_STUDENTS", 60)
    monkeypatch.setattr(config, "UPLOAD_MAX_TESTS", 1)
    assert run().ok
    store_saved = _save(run())
    assert store_saved
    assert "You already have 1 tests" in messages(run().issues.errors)


def _save(result: Analysis) -> dict[str, str]:
    return store.create_test(result.paper, result.sheets, title=result.title,
                             class_id=result.class_id, class_name=result.class_name,
                             files=result.files)


# --- storage ---------------------------------------------------------------------

def test_a_saved_test_reads_back_in_the_scheme_shape(sandbox: None) -> None:
    ids = _save(run())
    assert ids == {"assessment_id": "U01", "class_id": "C02", "name": "Paper"}
    test = registry.get_test("U01")
    assert test["topic_coverage"] == ["T1", "T2"] and test["seq"] == 1
    mcq, written, untagged = test["questions"]
    assert mcq == {"question_id": "U01Q01", "number": 1, "topic": "T1", "type": "mcq",
                   "max_marks": 1, "prompt": "Which fraction is equal to 2/4?",
                   "options": {"a": "1/4", "b": "1/2", "c": "2/8", "d": "3/4"}, "correct": "b",
                   "distractor_map": {}, "model_answer": "1/2", "origin": "uploaded"}
    assert written["scheme"][0] == {"marks": 1, "criterion": "Finds a common denominator"}
    assert sum(c["marks"] for c in written["scheme"]) == written["max_marks"] == 3
    assert untagged["topic"] == "" and {q["origin"] for q in test["questions"]} == {"uploaded"}
    assert registry.class_learners("C02")[0] == {"learner_id": "C02-S01", "name": "Ada L."}


def test_multiple_choice_answers_are_stored_as_text_with_the_letter(sandbox: None) -> None:
    rows = ('S1,A,,b,"x","y"', 'S2,B,,C,"x","y"', 'S3,C,,"b) 1/2","x","y"', 'S4,D,,3/4,"x","y"')
    _save(run(sheets_text=sheets(*rows)))
    first = [a for a in registry.list_answers("U01") if a["question_id"] == "U01Q01"]
    assert [(a["answer"], a["selected_option"]) for a in first] == [
        ("1/2", "b"), ("2/8", "c"), ("1/2", "b"), ("3/4", "d")]


def test_students_are_stored_with_their_sheet_id_and_origin(sandbox: None) -> None:
    _save(run())
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM students WHERE class_id='C02' ORDER BY learner_id"
                            ).fetchall()
    assert [(r["learner_id"], r["ref"], r["email"], r["origin"]) for r in rows][:2] == [
        ("C02-S01", "S1", "ada@example.com", "uploaded"),
        ("C02-S02", "S2", "bo@example.com", "uploaded")]


def test_a_second_test_reuses_the_class_and_matching_students(sandbox: None) -> None:
    _save(run())
    with db.connect() as conn:
        conn.execute("UPDATE students SET email='ada@school.org' WHERE learner_id='C02-S01'")
    more = sheets(*STUDENTS[:2], 'S9,New Kid,new@example.com,b,"x","y"', STUDENTS[3])
    second = _save(run(sheets_text=more, class_id=None, class_name="year 9"))
    assert second["assessment_id"] == "U02" and second["class_id"] == "C02"
    by_ref = {s["learner_id"]: s for s in registry.class_learners("C02")}
    assert list(by_ref) == ["C02-S01", "C02-S02", "C02-S03", "C02-S04", "C02-S05"]
    assert by_ref["C02-S05"]["name"] == "New Kid"
    with db.connect() as conn:
        email = conn.execute("SELECT email FROM students WHERE learner_id='C02-S01'"
                             ).fetchone()["email"]
    assert email == "ada@school.org"
    assert {a["learner_id"] for a in registry.list_answers("U02")} == {
        "C02-S01", "C02-S02", "C02-S04", "C02-S05"}


def test_a_different_class_name_makes_the_next_class(sandbox: None) -> None:
    _save(run())
    assert _save(run(class_name="Year 10"))["class_id"] == "C03"
    assert [c["class_id"] for c in registry.list_classes()] == ["C02", "C03"]
    assert mock_api.get_courses()[0]["id"] == "C1"


def test_client_supplied_class_ids_are_checked(sandbox: None) -> None:
    for wrong in ("C1", "C77", "../x"):
        result = run(class_id=wrong)
        assert not result.ok and "could not find that class" in messages(result.issues.errors)
    _save(run())
    assert run(class_id="C02").ok


def test_a_class_is_required(sandbox: None) -> None:
    result = run(class_name="  ")
    assert "give the new class a name" in messages(result.issues.errors)


def test_delete_purges_everything_for_the_test_and_nothing_else(sandbox: None) -> None:
    _save(run())
    _save(run(sheets_text=sheets(*STUDENTS)))
    mark = {"learner_id": "C02-S01", "question_id": "U01Q01", "awarded": 1, "max_marks": 1,
            "confidence": 1.0}
    with db.connect() as conn:
        demo_marks = conn.execute("SELECT COUNT(*) FROM marks WHERE assessment_id NOT LIKE 'U%'"
                                  ).fetchone()[0]
    for aid in ("U01", "U02"):
        db.save_batch({"batch_id": f"B-{aid}-x", "assessment_id": aid, "cohort_id": "C02",
                       "facilitator_minutes": 60}, "2026-09-01")
        db.record_marks(f"B-{aid}-x", aid, [{**mark, "question_id": f"{aid}Q01"}])
        db.record_diagnoses(f"B-{aid}-x", aid, [{"learner_id": "C02-S01", "taxonomy_node": "M01",
                                                 "question_id": f"{aid}Q02"}])
        db.record_override(f"B-{aid}-x", {"type": "mark", "target_id": "x"})
    service._LIVE["B-U01-x"] = {"batch_id": "B-U01-x", "assessment_id": "U01", "status": "complete"}

    assert store.delete_test("U01") is True and store.delete_test("U01") is False
    service.forget_assessment("U01")
    assert "B-U01-x" not in service._LIVE
    with db.connect() as conn:
        def count(table: str, aid: str) -> int:
            return conn.execute(f"SELECT COUNT(*) FROM {table} WHERE assessment_id=?",
                                (aid,)).fetchone()[0]
        for table in ("uploaded_answers", "marks", "error_profile", "batches"):
            assert count(table, "U01") == 0 and count(table, "U02") > 0, table
        assert conn.execute("SELECT COUNT(*) FROM overrides WHERE batch_id='B-U01-x'"
                            ).fetchone()[0] == 0
        assert conn.execute("SELECT COUNT(*) FROM overrides WHERE batch_id='B-U02-x'"
                            ).fetchone()[0] == 1
        assert conn.execute("SELECT COUNT(*) FROM marks WHERE assessment_id NOT LIKE 'U%'"
                            ).fetchone()[0] == demo_marks
    assert registry.get_test("U01") is None and registry.get_test("U02") is not None
    assert len(registry.class_learners("C02")) == 4


# --- the sample ------------------------------------------------------------------

def test_the_sample_is_valid_and_shows_the_shared_mistake_and_the_language_case(
        sandbox: None) -> None:
    result = sample.analyse_sample()
    assert result.ok and result.issues.warnings == []
    assert (result.summary["question_count"], result.summary["total_marks"],
            result.summary["student_count"], result.summary["untagged_questions"]) == (6, 11, 8, 0)
    # Numerators added over denominators added: 1/3 + 1/4 as 2/7, 2/5 + 1/2 as 3/7.
    adders = [s.name for s in result.sheets
              if "2/7" in s.answers[3] or "3/7" in s.answers[4] or s.answers[5] == "a"
              or s.answers[5] == "2/6"]
    assert len(adders) >= 4
    hiro = next(s for s in result.sheets if s.name == "Hiro M.")
    assert "7/12" in hiro.answers[3] and "9/10" in hiro.answers[4]
    assert hiro.answers[3].startswith("Need same bottom number")
    assert all(s.email.endswith("@example.com") for s in result.sheets)


def test_adding_the_sample_twice_returns_the_same_test(sandbox: None,
                                                       client: TestClient) -> None:
    first = client.post("/api/uploads/sample")
    second = client.post("/api/uploads/sample")
    assert first.status_code == second.status_code == 201
    assert first.json()["assessment_id"] == second.json()["assessment_id"] == "U01"
    assert (first.json()["created"], second.json()["created"]) == (True, False)
    assert len(client.get("/api/uploads/tests").json()) == 1
    assert len(registry.class_learners("C02")) == 8
    client.delete("/api/uploads/tests/U01")
    third = client.post("/api/uploads/sample").json()
    assert third["created"] is True and third["class_id"] == "C02"


# --- the API ---------------------------------------------------------------------

def test_preview_reports_content_problems_as_a_normal_response(client: TestClient,
                                                               sandbox: None) -> None:
    good = client.post("/api/uploads/preview", json=body())
    assert good.status_code == 200 and good.json()["ok"] is True
    assert good.json()["summary"]["student_count"] == 4
    bad = client.post("/api/uploads/preview", json=body(paper(MCQ.replace(",b,", ",z,", 1))))
    assert bad.status_code == 200 and bad.json()["ok"] is False
    assert set(bad.json()["errors"][0]) == {"file", "where", "message"}
    assert registry.list_tests() == []


def test_saving_creates_the_test_and_reports_why_it_cannot_run_yet(client: TestClient,
                                                                    sandbox: None) -> None:
    response = client.post("/api/uploads/tests", json=body(title="  Term test "))
    assert response.status_code == 201
    saved = response.json()
    assert (saved["assessment_id"], saved["class_id"], saved["name"]) == (
        "U01", "C02", "Term test")
    assert "AI key" in saved["run_blocked_reason"]
    [row] = client.get("/api/uploads/tests").json()
    assert (row["assessment_id"], row["question_count"], row["student_count"]) == ("U01", 3, 4)
    assert set(row) == {"assessment_id", "class_id", "name", "due_at", "question_count",
                        "student_count", "created_at"}
    assignment = mock_api.get_assignments("C02")[0]
    assert assignment["display_name"] == "Term test" and assignment["points_possible"] == 6


def test_saving_an_invalid_upload_is_a_422_with_the_errors(client: TestClient,
                                                           sandbox: None) -> None:
    response = client.post("/api/uploads/tests", json=body(paper(MCQ.replace(",b,", ",z,", 1))))
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "INVALID_UPLOAD" and detail["errors"][0]["file"] == "paper.csv"
    assert registry.list_tests() == [] and registry.list_classes() == []


def test_delete_over_http(client: TestClient, sandbox: None) -> None:
    client.post("/api/uploads/tests", json=body())
    assert client.delete("/api/uploads/tests/U01").json() == {"deleted": True}
    assert client.delete("/api/uploads/tests/U01").status_code == 404
    demo = client.delete("/api/uploads/tests/A3")
    assert demo.status_code == 400 and demo.json()["detail"]["code"] == "DEMO_TEST"
    assert client.get("/api/uploads/tests").json() == []
    assert len(mock_api.get_assignments("C1")) == 4


def test_delete_is_refused_while_a_run_is_in_flight(client: TestClient, sandbox: None,
                                                    monkeypatch: pytest.MonkeyPatch) -> None:
    client.post("/api/uploads/tests", json=body())
    monkeypatch.setattr(service, "_LIVE", {"B-U01-z": {"assessment_id": "U01",
                                                       "status": "running"}})
    refused = client.delete("/api/uploads/tests/U01")
    assert refused.status_code == 409 and refused.json()["detail"]["code"] == "RUN_IN_PROGRESS"
    assert registry.get_test("U01") is not None


@pytest.mark.parametrize("name, content, message", [
    ("test.pdf", "%PDF-1.7", "We can't read PDF files yet. Save your test as CSV, or use our "
                             "template."),
    ("test.DOCX", "x", "We can't read Word files yet."),
    ("test.xlsx", "x", "We can't read Excel files yet."),
    ("scan.png", "x", "We can't read image files yet."),
    ("renamed.csv", "%PDF-1.4 binary", "We can't read PDF files yet."),
    ("renamed.csv", "PK\x03\x04rest", "We can't read Word or Excel files yet."),
    ("renamed.csv", "a,b\x00c", "We can't read binary files yet."),
    ("test.csv.exe", "x", "We can't read .exe files yet."),
    ("noextension", "x", "We can't read these files yet."),
])
def test_files_we_cannot_read_are_refused_with_a_400(client: TestClient, sandbox: None, name: str,
                                                     content: str, message: str) -> None:
    payload = body()
    payload["paper"] = {"name": name, "content": content}
    for path in ("/api/uploads/preview", "/api/uploads/tests"):
        response = client.post(path, json=payload)
        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "UNSUPPORTED_FILE"
        assert response.json()["detail"]["message"].startswith(message)
    assert registry.list_tests() == []


def test_the_message_for_an_answer_sheet_file_says_answer_sheets(client: TestClient,
                                                                 sandbox: None) -> None:
    payload = body()
    payload["sheets"] = [{"name": "class.pdf", "content": "%PDF"}]
    detail = client.post("/api/uploads/preview", json=payload).json()["detail"]
    assert detail["message"] == ("We can't read PDF files yet. Save your answer sheets as CSV, "
                                 "or use our template.")


def test_an_oversize_file_is_a_413(client: TestClient, sandbox: None,
                                   monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "UPLOAD_MAX_BYTES", 200)
    for path in ("/api/uploads/preview", "/api/uploads/tests"):
        response = client.post(path, json=body(GOOD_PAPER + "x" * 300))
        assert response.status_code == 413
        assert response.json()["detail"]["code"] == "FILE_TOO_LARGE"


def test_a_file_named_as_a_path_cannot_reach_the_disk(client: TestClient, sandbox: None) -> None:
    payload = body()
    payload["paper"]["name"] = "../../etc/passwd.csv"
    response = client.post("/api/uploads/preview", json=payload)
    assert response.status_code == 200 and "passwd" not in json.dumps(response.json()["summary"])


@pytest.mark.parametrize("name, kind", [("paper.csv", "text/csv"), ("sheets.csv", "text/csv"),
                                        ("paper.json", "application/json"),
                                        ("sheet.txt", "text/plain")])
def test_templates_download_and_are_themselves_valid_uploads(
        client: TestClient, sandbox: None, name: str, kind: str) -> None:
    response = client.get(f"/api/uploads/templates/{name}")
    assert response.status_code == 200 and response.headers["content-type"].startswith(kind)
    assert f'filename="{name}"' in response.headers["content-disposition"]
    assert response.text.strip()


def test_the_template_pairs_upload_cleanly(client: TestClient, sandbox: None) -> None:
    def text(name: str) -> str:
        return client.get(f"/api/uploads/templates/{name}").text

    csv_pair = client.post("/api/uploads/preview", json={
        "class_name": "T", "paper": {"name": "paper.csv", "content": text("paper.csv")},
        "sheets": [{"name": "sheets.csv", "content": text("sheets.csv")}]}).json()
    assert csv_pair["ok"] and csv_pair["summary"]["question_count"] == 3
    mixed = client.post("/api/uploads/preview", json={
        "class_name": "T", "paper": {"name": "paper.json", "content": text("paper.json")},
        "sheets": [{"name": "sheet.txt", "content": text("sheet.txt")}]}).json()
    assert mixed["ok"] and mixed["summary"]["title"] == "Fractions quick check"
    assert mixed["summary"]["student_count"] == 1
    assert client.get("/api/uploads/templates/../secret").status_code in (404, 422)
    assert client.get("/api/uploads/templates/other.csv").status_code == 404


def test_a_saved_upload_does_not_change_the_demo_data(client: TestClient, sandbox: None) -> None:
    before = mock_api.get_submissions("A3")
    client.post("/api/uploads/tests", json=body())
    assert mock_api.get_submissions("A3") == before
    assert [a["id"] for a in mock_api.get_assignments("C1")] == ["A1", "A2", "A3", "A4"]
    assert mock_api.get_courses()[0]["id"] == "C1" and not llm.available()
