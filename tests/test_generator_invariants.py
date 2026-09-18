"""Invariants on the generated fixture.

The independence claim rests on these: the errors are injected by explicit
Python rules, the taxonomy those rules name is real, and the language noise
applied to second-language learners is surface grammar only. If noise could
change a number then a second-language learner's mathematics would be wrong for
a reason the fixture invented, and every language separation number in
eval/results.md would be meaningless.

The generator is fully seeded, so the whole run is replayed here and the clean
text is compared against the committed noisy text directly. That is a stronger
check than any pattern match on the output alone.
"""

from __future__ import annotations

import json
import random
import re
from pathlib import Path
from typing import Any

import pytest

from data import generator

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

SPLIT_DECIMAL = re.compile(r"\d\.\s\d")


def _load(name: str) -> dict[str, Any]:
    return json.loads((DATA / name).read_text())


@pytest.fixture(scope="module")
def personas() -> dict[str, Any]:
    return _load("personas.json")


@pytest.fixture(scope="module")
def taxonomy() -> dict[str, Any]:
    return _load("taxonomy.json")


@pytest.fixture(scope="module")
def schemes() -> dict[str, Any]:
    return _load("marking_schemes.json")


@pytest.fixture(scope="module")
def submissions() -> dict[str, Any]:
    return _load("generated/submissions.json")


@pytest.fixture(scope="module")
def truth() -> dict[str, Any]:
    return _load("ground_truth.json")


@pytest.fixture(scope="module")
def replay(personas: dict[str, Any], schemes: dict[str, Any],
           taxonomy: dict[str, Any]) -> list[dict[str, Any]]:
    """Re-runs the seeded generator and keeps the text before and after noise."""
    params = generator._load_params()
    rows: list[dict[str, Any]] = []
    for learner in personas["learners"]:
        lid, traits = learner["learner_id"], learner["traits"]
        for scheme in schemes["assessments"]:
            aid = scheme["assessment_id"]
            if aid in traits["missing_assessments"]:
                continue
            rng = random.Random(f"{generator.SEED}:{lid}:{aid}")
            rows.extend(_replay_assessment(learner, scheme, taxonomy, params[aid], rng))
    return rows


def _replay_assessment(learner: dict[str, Any], scheme: dict[str, Any], taxonomy: dict[str, Any],
                       params: dict[str, Any], rng: random.Random) -> list[dict[str, Any]]:
    lid, traits = learner["learner_id"], learner["traits"]
    noisy_learner = traits["second_language"] and traits["language_noise_level"] > 0
    out: list[dict[str, Any]] = []
    for q in scheme["questions"]:
        relevant = [n for n in learner["assigned_misconceptions"]
                    if generator._node_topic(taxonomy, n) == q["topic"]]
        careless = rng.random() < traits["careless_rate"]
        if q["type"] == "mcq":
            answer, node, _ = generator.choose_mcq_option(q, relevant, careless, rng)
            clean = answer
        else:
            clean, node, _ = generator.build_written(q, relevant, careless, rng, params)
            answer = clean
            if noisy_learner:
                answer = generator.apply_language_noise(
                    clean, traits["language_noise_level"], rng)
        out.append({"learner_id": lid, "assessment_id": scheme["assessment_id"],
                    "question_id": q["question_id"], "type": q["type"],
                    "clean": clean, "answer": answer, "node": node,
                    "noisy": noisy_learner and q["type"] == "written"})
    return out


def test_replay_reproduces_the_committed_submissions(replay: list[dict[str, Any]],
                                                     submissions: dict[str, Any]) -> None:
    """Proves the committed data came from the seeded rule table and nothing else."""
    committed = {(s["learner_id"], s["question_id"]): s["answer"]
                 for s in submissions["submissions"]}
    assert len(committed) == len(replay)
    mismatches = [(r["learner_id"], r["question_id"]) for r in replay
                  if committed.get((r["learner_id"], r["question_id"])) != r["answer"]]
    assert not mismatches, (
        f"{len(mismatches)} answers do not reproduce from the seed, so the fixture is not "
        f"deterministic: {mismatches[:5]}")


def test_language_noise_never_altered_a_number(replay: list[dict[str, Any]]) -> None:
    """The mathematical content is decided before noise is applied and must come
    through it untouched. Clause inversion may reorder tokens within a sentence,
    so the multiset is the invariant, not the sequence."""
    noisy = [r for r in replay if r["noisy"]]
    assert noisy, "no second-language written answers in the fixture"
    for row in noisy:
        before = sorted(generator.math_tokens(row["clean"]))
        after = sorted(generator.math_tokens(row["answer"]))
        assert before == after, (
            f"noise changed the mathematics on {row['learner_id']} {row['question_id']}: "
            f"{before} became {after}")


def test_no_decimal_was_split_by_noise(replay: list[dict[str, Any]]) -> None:
    """A split decimal, "0. 9" where the clean text had "0.9", is the specific
    corruption a naive sentence splitter would introduce.

    A bare search for the pattern is not enough on its own: "= 1.65. 0.9 is
    larger" matches it at an ordinary sentence boundary. So each decimal from the
    clean text is required to survive verbatim, and the pattern count is only
    allowed to differ where the clean text already had such a boundary.
    """
    for row in [r for r in replay if r["noisy"]]:
        for token in generator.math_tokens(row["clean"]):
            assert token in row["answer"], (
                f"{row['learner_id']} {row['question_id']}: the number {token} did not survive "
                f"the language noise intact")
        if SPLIT_DECIMAL.search(row["answer"]):
            assert SPLIT_DECIMAL.search(row["clean"]), (
                f"{row['learner_id']} {row['question_id']}: noise introduced a split decimal")


def test_assigned_misconceptions_exist_in_the_taxonomy(personas: dict[str, Any],
                                                       taxonomy: dict[str, Any]) -> None:
    known = {n["id"] for n in taxonomy["nodes"]}
    for learner in personas["learners"]:
        for node in learner["assigned_misconceptions"]:
            assert node in known, f"{learner['learner_id']} is assigned unknown node {node}"


def test_distractors_map_to_real_nodes_on_the_right_topic(schemes: dict[str, Any],
                                                          taxonomy: dict[str, Any]) -> None:
    """A distractor pointing at another topic's node would make MCQ diagnosis
    confidently wrong with no model call to blame."""
    topics = {n["id"]: n["topic"] for n in taxonomy["nodes"]}
    for scheme in schemes["assessments"]:
        for q in scheme["questions"]:
            for option, node in (q.get("distractor_map") or {}).items():
                assert node in topics, f"{q['question_id']} option {option} maps to unknown {node}"
                assert topics[node] == q["topic"], (
                    f"{q['question_id']} is topic {q['topic']} but option {option} maps to "
                    f"{node} on topic {topics[node]}")
                assert option != q["correct"], (
                    f"{q['question_id']} maps its correct option to a misconception")


def test_persona_composition_matches_the_plan(personas: dict[str, Any]) -> None:
    learners = personas["learners"]
    assert len(learners) == 12
    returners = [l for l in learners if l["traits"]["returner"]]
    assert len(returners) == 3
    for learner in returners:
        assert 1 <= len(learner["traits"]["missing_assessments"]) <= 2

    second_language = [l for l in learners if l["traits"]["second_language"]]
    assert len(second_language) == 3
    for learner in second_language:
        assert 0.3 <= learner["traits"]["language_noise_level"] <= 0.6

    for learner in learners:
        assert 2 <= len(learner["assigned_misconceptions"]) <= 3
        assert len(set(learner["assigned_misconceptions"])) == \
            len(learner["assigned_misconceptions"])


def test_enough_learners_share_m01_on_a3(truth: dict[str, Any]) -> None:
    """The cohort threshold has to fire visibly on A3 or the demo has no teaching
    problem to show and no override to withdraw."""
    holders = {r["learner_id"] for r in truth["responses"]
               if r["assessment_id"] == "A3" and r["injected_node"] == "M01"}
    assert len(holders) >= 5, f"only {sorted(holders)} were given M01 on A3"


def test_missing_assessments_are_genuinely_absent(personas: dict[str, Any],
                                                  submissions: dict[str, Any]) -> None:
    present: dict[str, set[str]] = {}
    for sub in submissions["submissions"]:
        present.setdefault(sub["learner_id"], set()).add(sub["assessment_id"])
    for learner in personas["learners"]:
        missing = set(learner["traits"]["missing_assessments"])
        overlap = missing & present.get(learner["learner_id"], set())
        assert not overlap, (
            f"{learner['learner_id']} is meant to be missing {sorted(missing)} but has "
            f"submissions for {sorted(overlap)}")


def test_ground_truth_covers_every_submission(submissions: dict[str, Any],
                                              truth: dict[str, Any]) -> None:
    submitted = {(s["learner_id"], s["question_id"]) for s in submissions["submissions"]}
    scored = {(r["learner_id"], r["question_id"]) for r in truth["responses"]}
    assert submitted == scored, "ground truth and submissions describe different responses"
