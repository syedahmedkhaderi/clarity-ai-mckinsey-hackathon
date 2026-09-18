"""The anti-fabrication guarantee.

Every diagnosis of a written answer quotes the learner's own words back as
evidence, and the UI highlights that span inside the answer on screen. If the
span were not verbatim text from that answer the highlight would be a
fabrication a judge could read off the screen, which is the worst failure this
demo has available to it.

MCQ diagnoses are excluded on purpose: their evidence is the option text from
the marking scheme, and the learner's answer is a single option letter.
"""

from __future__ import annotations

from typing import Any

MODEL_SOURCES = ("model", "fallback")


def _written_diagnoses(batch: dict[str, Any]) -> list[dict[str, Any]]:
    return [d for d in batch["diagnoses"] if d["source"] in MODEL_SOURCES]


def test_there_are_written_diagnoses_to_check(pipeline: dict[str, Any]) -> None:
    assert _written_diagnoses(pipeline), (
        "no model or fallback diagnoses in this run, so the guarantee is untested")


def test_evidence_spans_are_verbatim(pipeline: dict[str, Any],
                                     answers: dict[tuple[str, str], str]) -> None:
    for d in _written_diagnoses(pipeline):
        key = (d["learner_id"], d["question_id"])
        assert key in answers, f"diagnosis for {key} has no matching submission"
        span = d["evidence_span"]
        if not span:
            continue
        assert span in answers[key], (
            f"fabricated evidence: {d['learner_id']} {d['question_id']} cites {span!r}, "
            f"which does not appear in the answer {answers[key]!r}")


def test_escalated_diagnoses_also_cite_real_evidence(pipeline: dict[str, Any],
                                                     answers: dict[tuple[str, str], str]) -> None:
    """An escalation is read by a human next to the learner's answer, so its
    evidence has to survive the same check as a surviving diagnosis."""
    for esc in pipeline["escalations"]:
        if esc["raised_by"] != "diagnostician" or not esc["question_id"]:
            continue
        key = (esc["learner_id"], esc["question_id"])
        assert key in answers, f"escalation {esc['escalation_id']} names no real response"


def test_named_nodes_exist_in_the_taxonomy(pipeline: dict[str, Any]) -> None:
    """Evidence pointing at a node that is not in the published taxonomy would be
    unauditable by the subject expert the taxonomy exists for."""
    from backend.lms import mock_api

    known = {n["id"] for n in mock_api.taxonomy()["nodes"]}
    for d in pipeline["diagnoses"]:
        assert d["taxonomy_node"] in known, f"unknown node {d['taxonomy_node']}"
        assert d["alternative_node"] is None or d["alternative_node"] in known, (
            f"unknown runner-up node {d['alternative_node']}")
