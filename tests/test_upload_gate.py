"""An uploaded test can never be marked or diagnosed by the demo rules.

Three layers, each proven here. The connector refuses an uploaded run with no AI
key. The rule engine gives an uploaded question zero-confidence marks and no
diagnosis, so the reviewer hands the work to a person. The diagnostician skips a
question with no topic instead of escalating it. Nothing here uses a live model.
"""

from __future__ import annotations

import re
from typing import Any, Iterator

import pytest
from fastapi.testclient import TestClient
from upload_helpers import GOOD_PAPER, MCQ, STUDENTS, body, sandbox, sheets

from backend import llm, service
from backend.agents import diagnostician, intake, offline_rules, reviewer
from backend.api import app
from backend.lms import mock_api
from backend.models import Mark, Submission
from backend.state import new_state
from backend.uploads import store
from backend.uploads.analyse import analyse

__all__ = ["sandbox"]

# Names a demo rule would recognise: the slot after the first two characters is Q4.
DEMO_SHAPED = {"question_id": "U9Q4", "topic": "T2", "type": "written", "max_marks": 3,
               "prompt": "A learner walks 1/3 km then 1/4 km. How far in total?",
               "scheme": [{"marks": 1, "criterion": "Common denominator"},
                          {"marks": 1, "criterion": "Converts both"},
                          {"marks": 1, "criterion": "Final answer"}]}
M01_ANSWER = "1/3 + 1/4 = 2/7 km"


class _Sub:
    learner_id = "C02-S01"
    answer = M01_ANSWER
    selected_option = None


@pytest.fixture(scope="module")
def client(pipeline: dict[str, Any]) -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


def save(paper_text: str = GOOD_PAPER, rows: tuple[str, ...] = STUDENTS,
         name: str = "Year 9") -> dict[str, str]:
    result = analyse(class_id=None, class_name=name, title=None,
                     paper_file=("paper.csv", paper_text),
                     sheet_files=[("sheets.csv", sheets(*rows))])
    assert result.ok, result.issues.errors
    return store.create_test(result.paper, result.sheets, title=result.title,
                             class_id=result.class_id, class_name=result.class_name,
                             files=result.files)


# --- layer one: the connector --------------------------------------------------

def test_an_uploaded_run_is_refused_without_a_key(sandbox: None, client: TestClient) -> None:
    saved = save()
    assert not llm.available()
    with pytest.raises(mock_api.RunRefused) as refused:
        mock_api.resolve_run(saved["assessment_id"], "C1")
    assert (refused.value.status, refused.value.code) == (409, "AI_KEY_REQUIRED")
    response = client.post("/api/batch/run", json={"assessment_id": saved["assessment_id"],
                                                   "cohort_id": saved["class_id"]})
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "AI_KEY_REQUIRED"
    assert mock_api.resolve_run("A3", "C1") == "C1"


def test_the_saved_response_says_the_run_is_blocked(sandbox: None, client: TestClient) -> None:
    assert "AI key" in client.post("/api/uploads/tests", json=body()).json()["run_blocked_reason"]


def test_with_a_key_the_run_belongs_to_the_uploaded_class(sandbox: None,
                                                          monkeypatch: pytest.MonkeyPatch) -> None:
    saved = save()
    monkeypatch.setattr(llm, "available", lambda: True)
    assert mock_api.resolve_run(saved["assessment_id"], "C1") == saved["class_id"]


# --- layer two: the rule engine ------------------------------------------------

def test_demo_rules_never_reach_an_uploaded_question() -> None:
    """The id is chosen so that, without the origin guard, the Q4 rule would fire."""
    assert DEMO_SHAPED["question_id"][2:] == "Q4"
    uploaded = {**DEMO_SHAPED, "origin": "uploaded"}
    mark = offline_rules.mark_written_offline(uploaded, _Sub())
    assert (mark.awarded, mark.confidence, mark.source, mark.provisional) == (
        0.0, 0.0, "fallback", True)
    assert mark.criteria_met == []
    assert mark.criteria_missed == ["Common denominator", "Converts both", "Final answer"]
    mark = Mark(question_id="U9Q4", learner_id="C02-S01", awarded=0.0, max_marks=3, confidence=0.0)
    assert offline_rules.diagnose_offline(uploaded, _Sub(), mark) is None


def test_the_same_question_without_an_origin_still_uses_the_demo_rules() -> None:
    """A question with no origin key is a demo question. This is what keeps the
    demo scenario on the numbers it has always had."""
    demo = {k: v for k, v in DEMO_SHAPED.items() if k != "scheme"} | {
        "prompt": mock_api.get_question("A3Q4")["prompt"],
        "scheme": mock_api.get_question("A3Q4")["scheme"]}
    mark = offline_rules.mark_written_offline(demo, _Sub())
    assert mark.confidence > 0.6 and mark.awarded == 0.0
    d = offline_rules.diagnose_offline(demo, _Sub(), mark)
    assert d is not None and d.taxonomy_node == "M01"


def test_an_uploaded_question_with_no_scheme_does_not_crash_the_fallback() -> None:
    bare = {"question_id": "U01Q01", "topic": "", "type": "written", "max_marks": 2,
            "prompt": "Why?", "origin": "uploaded"}
    mark = offline_rules.mark_written_offline(bare, _Sub())
    assert mark.awarded == 0.0 and mark.criteria_missed == []


def test_the_reviewer_hands_a_fallback_mark_to_a_person() -> None:
    mark = offline_rules.mark_written_offline({**DEMO_SHAPED, "origin": "uploaded"}, _Sub())
    state = new_state("B-gate", "U01", "C02", 60)
    assert reviewer.gate_marks(state, [mark]) == []
    assert [e.reason_code for e in state["escalations"]] == ["LOW_MARK_CONFIDENCE"]


def test_an_offline_run_of_an_uploaded_test_escalates_every_written_mark(sandbox: None) -> None:
    saved = save()
    result = service.run_sync(saved["assessment_id"])
    assert result["status"] == "complete" and result["cohort_id"] == saved["class_id"]
    written = [m for m in result["all_marks"] if m["question_id"] in ("U01Q02", "U01Q03")]
    assert len(written) == 8 and all(m["confidence"] == 0.0 for m in written)
    assert {e["reason_code"] for e in result["escalations"]} == {"LOW_MARK_CONFIDENCE"}
    assert len(result["escalations"]) == 8
    survivors = result["marks"]
    assert {m["question_id"] for m in survivors} == {"U01Q01"} and len(survivors) == 4
    assert all(m["source"] == "deterministic" for m in survivors)
    assert all(m["provisional"] is True for m in result["all_marks"])
    assert result["all_diagnoses"] == [] and result["diagnoses"] == []


def test_intake_reads_an_uploaded_class_against_its_own_tests(sandbox: None) -> None:
    save()
    save(rows=(*STUDENTS[:2], 'S9,New Kid,,b,"x","y"'))
    state = new_state("B-gate", "U02", "C02", 60)
    state = intake.run(state)
    by_name = {c.learner_name: c for c in state["learners"]}
    assert set(by_name) == {"Ada L.", "Bo K.", "Cy P.", "Di R.", "New Kid"}
    assert by_name["Ada L."].assessments_expected == ["U01", "U02"]
    assert by_name["Ada L."].returner is False
    assert by_name["New Kid"].returner is True and "Missing U01" in by_name["New Kid"].note
    assert by_name["Cy P."].assessments_present == ["U01"]
    assert len(state["submissions"]) == 9


# --- layer three: the diagnostician --------------------------------------------

LOST_PAPER = (
    "number,type,topic,marks,question,correct,option_a,option_b,option_c,option_d,"
    "model_answer,criteria\n"
    f"{MCQ}\n"
    '2,written,T2,3,"Add 1/3 and 1/4.",,,,,,"7/12","1|Denominator; 1|Convert; 1|Answer"\n'
    '3,written,,2,"Say why 1/8 is small.",,,,,,"More pieces.","1|Says why; 1|Compares"\n')
LOST_ROWS = (
    'S1,Ada,,a,"1/3 + 1/4 = 2/7","It is small."',
    'S2,Bo,,c,"2/7","Small."',
    'S3,Cy,,d,"1/12","Tiny."',
    'S4,Di,,a,"","Little."',
)


def lost_state(saved: dict[str, str]) -> Any:
    aid = saved["assessment_id"]
    state = new_state("B-gate", aid, saved["class_id"], 60)
    state["submissions"] = [Submission(**s) for s in mock_api.get_submissions(aid)]
    state["marks"] = [
        Mark(question_id=s.question_id, learner_id=s.learner_id, awarded=0.0,
             max_marks=float(mock_api.get_question(s.question_id)["max_marks"]),
             confidence=0.9, source="model") for s in state["submissions"]]
    return state


def stub_model(monkeypatch: pytest.MonkeyPatch, evidence: str | None = None) -> list[str]:
    """Answers every diagnosis prompt and records what was asked."""
    asked: list[str] = []

    def call_many(system: str, prompts: list[str], schema: Any, smart: bool = False,
                  on_progress: Any = None, on_timeout: Any = None,
                  budget_seconds: int | None = None) -> list[Any]:
        asked.extend(prompts)
        node = {"T1": "M04", "T2": "M01"}
        outs = []
        for prompt in prompts:
            answer = re.search(r'"""(.*?)"""', prompt, re.S).group(1)
            topic = re.search(r"\(topic (T\d)\)", prompt).group(1)
            outs.append(schema(taxonomy_node=node[topic], confidence=0.9,
                               evidence_span=answer if evidence is None else evidence,
                               reasoning="Stubbed."))
        return outs

    monkeypatch.setattr(llm, "available", lambda: True)
    monkeypatch.setattr(llm, "call_many", call_many)
    return asked


def test_untagged_and_blank_responses_are_skipped_without_an_escalation(
        sandbox: None, monkeypatch: pytest.MonkeyPatch) -> None:
    asked = stub_model(monkeypatch)
    state = diagnostician.run(lost_state(save(LOST_PAPER, LOST_ROWS)))
    # Four multiple-choice misses and three non-blank tagged written answers.
    assert len(asked) == 7 and len(state["all_diagnoses"]) == 7
    assert not any("Say why 1/8" in p for p in asked)
    assert {d.question_id for d in state["all_diagnoses"]} == {"U01Q01", "U01Q02"}
    assert not any(d.learner_id == "C02-S04" and d.question_id == "U01Q02"
                   for d in state["all_diagnoses"])
    assert state["escalations"] == []
    skipped = [t for t in state["trace"] if t.action == "skipped"]
    assert len(skipped) == 1 and skipped[0].detail.startswith("5 responses")


def test_an_uploaded_multiple_choice_miss_goes_to_the_model_with_its_options(
        sandbox: None, monkeypatch: pytest.MonkeyPatch) -> None:
    asked = stub_model(monkeypatch)
    state = diagnostician.run(lost_state(save(LOST_PAPER, LOST_ROWS)))
    mcq_prompts = [p for p in asked if "Which fraction is equal to 2/4?" in p]
    assert len(mcq_prompts) == 4
    assert "Options: a) 1/4; b) 1/2; c) 2/8; d) 3/4. Correct option: b." in mcq_prompts[0]
    mcq = [d for d in state["all_diagnoses"] if d.question_id == "U01Q01"]
    assert all(d.source == "model" and d.taxonomy_node == "M04" and d.topic == "T1" for d in mcq)


def test_evidence_that_is_not_in_the_answer_is_never_kept(
        sandbox: None, monkeypatch: pytest.MonkeyPatch) -> None:
    stub_model(monkeypatch, evidence="a sentence the student never wrote")
    state = diagnostician.run(lost_state(save(LOST_PAPER, LOST_ROWS)))
    assert state["all_diagnoses"] == [] and state["escalations"] == []
    assert any(t.action == "evidence_check" for t in state["trace"])


def test_with_no_model_an_uploaded_run_makes_no_diagnoses(sandbox: None) -> None:
    state = diagnostician.run(lost_state(save(LOST_PAPER, LOST_ROWS)))
    assert state["all_diagnoses"] == [] and state["escalations"] == []


def test_a_demo_multiple_choice_question_still_ignores_a_missing_distractor() -> None:
    """Demo behaviour: only an uploaded MCQ falls through to the model."""
    q = mock_api.get_question("A3Q1")
    assert offline_rules.is_demo(q) and q["distractor_map"]
    assert not offline_rules.is_demo({"origin": "uploaded"})
