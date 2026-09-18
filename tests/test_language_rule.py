"""The language rule, which is the single most important behaviour in LOOP.

A learner who understands the mathematics but writes it badly must never be
recorded as conceptually weak. Meridian teaches many learners in a second
language, and a system that reads broken grammar as a broken idea would send
those learners to the wrong intervention every time.

This is enforced in code rather than asked for in a prompt, because a prompt is
a request and this is a guarantee. Observed before the guard existed: L11 wrote
"Answer is 7/12 km. and then add top ones together I make bottom number same 12."
- the correct total, in broken word order - and the model returned M02, a
procedural misconception, at 0.9 confidence.
"""

from __future__ import annotations

from typing import Any

from backend.agents.offline_rules import LANGUAGE_CLASS_NODES, mathematics_is_correct
from backend.lms import mock_api

# Learners whose written answers carry grammatical noise in the fixture.
SECOND_LANGUAGE = {"L04", "L05", "L11"}


def test_correct_value_is_recognised_whatever_the_prose(pipeline: dict[str, Any]) -> None:
    """The guard keys off the marking scheme, not off how fluent the answer reads."""
    question = mock_api.get_question("A3Q4")
    assert question is not None
    broken_but_right = ("Answer is 7/12 km. and then add top ones together "
                        "I make bottom number same 12.")
    fluent_but_wrong = "1/3 + 1/4 = 2/7. I add the tops and add the bottoms. So they walked 2/7 km."
    assert mathematics_is_correct(question, broken_but_right) is True
    assert mathematics_is_correct(question, fluent_but_wrong) is False


def test_a_correct_answer_is_never_given_a_misconception(pipeline: dict[str, Any],
                                                         answers: dict[tuple[str, str], str]) -> None:
    """If the learner reached the value the scheme asks for, the mathematics held,
    so no conceptual, procedural or computational node can explain it."""
    offenders: list[str] = []
    for d in pipeline["diagnoses"]:
        question = mock_api.get_question(d["question_id"])
        answer = answers.get((d["learner_id"], d["question_id"]), "")
        if question is None or not answer:
            continue
        if not mathematics_is_correct(question, answer):
            continue
        node = d.get("taxonomy_node")
        if node and node not in LANGUAGE_CLASS_NODES:
            offenders.append(f"{d['learner_id']} {d['question_id']} -> {node} "
                             f"({d['error_class']}) on a mathematically correct answer")
    assert not offenders, "correct mathematics diagnosed as a misconception: " + "; ".join(offenders)


def test_second_language_learners_get_no_conceptual_node_on_correct_work(
    pipeline: dict[str, Any], answers: dict[tuple[str, str], str]
) -> None:
    """The fixture's second-language learners carry grammatical noise that never
    changes their numbers. Where their mathematics is right, nothing in the
    surviving record may say otherwise."""
    for d in pipeline["diagnoses"]:
        if d["learner_id"] not in SECOND_LANGUAGE:
            continue
        question = mock_api.get_question(d["question_id"])
        answer = answers.get((d["learner_id"], d["question_id"]), "")
        if question is None or not mathematics_is_correct(question, answer):
            continue
        assert d["error_class"] == "language" or d["language_flag"], (
            f"{d['learner_id']} {d['question_id']} was recorded as "
            f"{d['error_class']} despite correct mathematics")


def test_language_escalations_name_both_readings(pipeline: dict[str, Any]) -> None:
    """A language escalation has to be actionable, not just a shrug."""
    for e in pipeline["escalations"]:
        if e["reason_code"] != "LANGUAGE_BARRIER":
            continue
        assert e["would_have_decided"], f"{e['escalation_id']} says nothing about what it would do"
        assert e["reasoning"], f"{e['escalation_id']} gives no reasoning"
