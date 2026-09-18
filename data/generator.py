"""Generates learner submissions and the ground truth that eval/ scores against.

Independence rule: every error in this file is produced by an explicit Python
rule keyed to a taxonomy node. No language model is involved in authoring the
errors. If a model authored the errors and the same model diagnosed them, the
recovery rate would be self-graded and meaningless.

Run:
    python data/generator.py
Outputs:
    data/generated/submissions.json   the only file the backend ever reads
    data/ground_truth.json            read by eval/evaluate.py only
"""

from __future__ import annotations

import json
import random
import re
from fractions import Fraction
from pathlib import Path
from typing import Any, Callable

HERE = Path(__file__).parent
SEED = 20260921
MISCONCEPTION_RATE = 0.75

# Nodes each written question slot can express. A misconception outside this set
# simply cannot surface on that question, which is correct: a ratio question
# cannot show a decimal alignment error.
WRITTEN_NODES: dict[str, list[str]] = {
    "Q2": ["M07", "M08", "M09", "M24"],
    "Q4": ["M01", "M02", "M03", "M21"],
    "Q6": ["M12", "M13", "M22"],
}


def gcd(x: int, y: int) -> int:
    while y:
        x, y = y, x % y
    return x


# --- error transformations, one function per taxonomy node ------------------

def m01_add_numerators_and_denominators(a: int, b: int, c: int, d: int) -> tuple[int, int]:
    """M01: treats a/b + c/d as (a+c)/(b+d)."""
    return (a + c, b + d)


def m02_common_denominator_unscaled_numerators(a: int, b: int, c: int, d: int) -> tuple[int, int]:
    """M02: correct common denominator, numerators left unscaled."""
    return (a + c, (b * d) // gcd(b, d))


def m03_final_addition_slip(a: int, b: int, c: int, d: int) -> tuple[int, int]:
    """M03: correct method, the last numerator addition is off by one."""
    total = Fraction(a, b) + Fraction(c, d)
    lcm = (b * d) // gcd(b, d)
    return (a * (lcm // b) + c * (lcm // d) + 1, lcm)


def m07_decimal_tail_as_integer(d1: float, d2: float) -> float:
    """M07: compares the digits after the point as whole numbers."""
    tail = lambda v: int(str(v).split(".")[1])
    return d1 if tail(d1) > tail(d2) else d2


def m08_misaligned_decimal_sum(d1: float, d2: float) -> float:
    """M08: right-aligns the last digits instead of the decimal points, so the
    shorter number is effectively shifted one column to the right."""
    places = lambda v: len(str(v).split(".")[1])
    shift = abs(places(d1) - places(d2))
    if places(d1) < places(d2):
        d1 = d1 / (10 ** shift)
    else:
        d2 = d2 / (10 ** shift)
    return round(d1 + d2, 3)


def m09_decimal_shift(d1: float, d2: float) -> float:
    """M09: point moved one place too far on the sum."""
    return round((d1 + d2) * 10, 2)


def m12_ratio_as_difference(r1: int, r2: int, total: int) -> int:
    """M12: hands out the ratio numbers as absolute amounts, splits the rest evenly."""
    return r1 + (total - r1 - r2) // 2


def m13_divide_by_people_not_shares(r1: int, r2: int, total: int) -> int:
    """M13: divides by how many people are named rather than the share count."""
    return total // 2


def m22_answers_for_the_other_person(r1: int, r2: int, total: int) -> int:
    """M22: method is right, applied to the person the question did not ask about."""
    return r2 * (total // (r1 + r2))


# --- written answer templates ----------------------------------------------

def build_q2_answer(node: str | None, careless: bool, rng: random.Random, p: dict[str, Any]) -> str:
    d1, d2 = p["q2_dec"]
    s, larger = round(d1 + d2, 2), max(d1, d2)
    if node == "M07":
        return f"I add them and get {s}. {m07_decimal_tail_as_integer(d1, d2)} is larger because its number after the point is bigger."
    if node == "M08":
        return f"I put the digits under each other on the right. {d1} + {d2} = {m08_misaligned_decimal_sum(d1, d2)}. {larger} is larger."
    if node == "M09":
        return f"{d1} + {d2} = {m09_decimal_shift(d1, d2)}. Moving the point across gives that. {larger} is the larger one."
    if node == "M24":
        return f"Lining up the points, {d1:.2f} + {d2:.2f} = {s}. {larger} is larger. I give the sum as {Fraction(int(s * 100), 100)}."
    if careless:
        return f"Lining up the points, {d1:.2f} + {d2:.2f} = {round(s + 0.1, 2)}. {larger} is larger, the tenths digit decides it."
    return rng.choice([
        f"I line up the decimal points. {d1:.2f} + {d2:.2f} = {s}. {larger} is larger because its tenths digit is bigger.",
        f"Writing both with two places gives {d1:.2f} and {d2:.2f}. The sum is {s}. Comparing tenths, {larger} is larger.",
        f"Points under points: {d1:.2f} plus {d2:.2f} makes {s}. In the tenths column {larger} wins, so {larger} is larger.",
    ])


def build_q4_answer(node: str | None, careless: bool, rng: random.Random, p: dict[str, Any]) -> str:
    a, b, c, d = p["q4_frac"]
    lcm = (b * d) // gcd(b, d)
    a2, c2 = a * (lcm // b), c * (lcm // d)
    total = Fraction(a, b) + Fraction(c, d)
    if node == "M01":
        n, m = m01_add_numerators_and_denominators(a, b, c, d)
        return f"{a}/{b} + {c}/{d} = {n}/{m}. I add the tops and add the bottoms. So they walked {n}/{m} km."
    if node == "M02":
        n, m = m02_common_denominator_unscaled_numerators(a, b, c, d)
        return f"The common denominator is {m}. So {a}/{m} + {c}/{m} = {n}/{m} km."
    if node == "M03":
        n, m = m03_final_addition_slip(a, b, c, d)
        return f"Common denominator {lcm}. {a}/{b} = {a2}/{lcm} and {c}/{d} = {c2}/{lcm}. Adding gives {n}/{m} km."
    if node == "M21":
        return f"Answer is {total.numerator}/{total.denominator} km. I make bottom number same {lcm} and then add top ones together."
    if careless:
        return f"Common denominator {lcm}. {a}/{b} = {a2}/{lcm}, {c}/{d} = {c2}/{lcm}. Total is {a2 + c2}/{lcm + 1} km."
    return rng.choice([
        f"Common denominator is {lcm}. {a}/{b} = {a2}/{lcm} and {c}/{d} = {c2}/{lcm}. {a2}/{lcm} + {c2}/{lcm} = {total.numerator}/{total.denominator} km.",
        f"{b} and {d} both divide into {lcm}, so I use {lcm}. That gives {a2}/{lcm} + {c2}/{lcm} = {total.numerator}/{total.denominator} km.",
        f"I rewrite both over {lcm}: {a2}/{lcm} and {c2}/{lcm}. Adding the numerators gives {total.numerator}/{total.denominator} km in total.",
    ])


def build_q6_answer(node: str | None, careless: bool, rng: random.Random, p: dict[str, Any]) -> str:
    r1, r2, total, n1, n2 = p["q6_ratio"]
    shares, one = r1 + r2, total // (r1 + r2)
    ans = r1 * one
    if node == "M12":
        v = m12_ratio_as_difference(r1, r2, total)
        return f"{n1} takes {r1} and {n2} takes {r2}. The rest is {total - r1 - r2}, split evenly. So {n1} gets {v}."
    if node == "M13":
        v = m13_divide_by_people_not_shares(r1, r2, total)
        return f"There are 2 people sharing, so {total} / 2 = {v}. {n1} gets {v}."
    if node == "M22":
        v = m22_answers_for_the_other_person(r1, r2, total)
        return f"{r1} + {r2} = {shares} shares. {total} / {shares} = {one} each share. The answer is {v}."
    if careless:
        return f"{r1} + {r2} = {shares} shares. {total} / {shares} = {one}. {n1} gets {r1} x {one} = {ans + 1}."
    return rng.choice([
        f"{r1} + {r2} = {shares} equal shares. {total} / {shares} = {one} per share. {n1} gets {r1} x {one} = {ans}.",
        f"Total shares are {shares}. One share is {total} / {shares} = {one}. {n1} has {r1} shares so {n1} gets {ans}.",
        f"I add the ratio parts: {shares}. Each share is {one}. {n1} gets {r1} of them, which is {ans}.",
    ])


BUILDERS: dict[str, Callable[..., str]] = {
    "Q2": build_q2_answer, "Q4": build_q4_answer, "Q6": build_q6_answer,
}


# --- language noise ---------------------------------------------------------

ARTICLES = {"the", "a", "an"}
TENSE_SWAPS = {
    "walked": "walk", "gives": "give", "makes": "make", "adds": "add",
    "is": "is", "takes": "take", "has": "have", "divides": "divide",
    "lining": "line", "comparing": "compare", "writing": "write", "adding": "add",
}
PROTECTED = re.compile(r"[0-9/]")


NUMERIC_TOKEN = re.compile(r"\d+/\d+|\d+\.\d+|\d+")


def math_tokens(text: str) -> list[str]:
    """Every number and fraction in the text, in order. Language noise must leave
    this list untouched."""
    return NUMERIC_TOKEN.findall(text)


def apply_language_noise(text: str, level: float, rng: random.Random) -> str:
    """Perturbs surface grammar only. Never touches a token containing a digit
    or a slash, so the mathematical content is provably unchanged."""
    if level <= 0:
        return text
    out: list[str] = []
    for token in text.split(" "):
        bare = token.strip(".,").lower()
        if PROTECTED.search(token):
            out.append(token)
            continue
        if bare in ARTICLES and rng.random() < level:
            continue
        if bare in TENSE_SWAPS and rng.random() < level:
            token = token.replace(bare, TENSE_SWAPS[bare]).replace(bare.capitalize(), TENSE_SWAPS[bare].capitalize())
        if bare.endswith("s") and len(bare) > 3 and bare not in TENSE_SWAPS and rng.random() < level * 0.4:
            token = token[:-1] if token[-1] == "s" else token
        out.append(token)
    text = " ".join(t for t in out if t)
    noisy = _invert_clause(text, level, rng)
    before, after = math_tokens(text), math_tokens(noisy)
    if sorted(before) != sorted(after):
        raise AssertionError(
            f"language noise altered the mathematics: {before} became {after}")
    return noisy


SENTENCE_BREAK = re.compile(r"\.(?!\d)")


def _invert_clause(text: str, level: float, rng: random.Random) -> str:
    """Moves the trailing clause of a sentence to the front, a common L2 pattern.

    Splits on sentence stops only. A full stop followed by a digit is a decimal
    point; splitting there would rewrite the learner's numbers, and the whole
    point of this fixture is that language noise never touches the mathematics."""
    parts = [s.strip() for s in SENTENCE_BREAK.split(text) if s.strip()]
    for i, part in enumerate(parts):
        words = part.split()
        if len(words) > 6 and rng.random() < level * 0.5:
            cut = len(words) // 2
            parts[i] = " ".join(words[cut:] + words[:cut])
    return ". ".join(parts) + "."


# --- generation -------------------------------------------------------------

def choose_mcq_option(q: dict[str, Any], nodes: list[str], careless: bool,
                      rng: random.Random) -> tuple[str, str | None, str]:
    """Returns (chosen option letter, injected node, kind)."""
    reverse = {node: ltr for ltr, node in q.get("distractor_map", {}).items()}
    for node in nodes:
        if node in reverse and rng.random() < MISCONCEPTION_RATE:
            return reverse[node], node, "misconception"
    if careless:
        wrong = [l for l in q["options"] if l != q["correct"]]
        return rng.choice(wrong), None, "careless"
    return q["correct"], None, "correct"


def build_written(q: dict[str, Any], nodes: list[str], careless: bool,
                  rng: random.Random, params: dict[str, Any]) -> tuple[str, str | None, str]:
    slot = q["question_id"][2:]
    allowed = [n for n in nodes if n in WRITTEN_NODES[slot]]
    for node in allowed:
        if rng.random() < MISCONCEPTION_RATE:
            return BUILDERS[slot](node, False, rng, params), node, "misconception"
    if careless:
        return BUILDERS[slot](None, True, rng, params), None, "careless"
    return BUILDERS[slot](None, False, rng, params), None, "correct"


def generate() -> None:
    taxonomy = json.loads((HERE / "taxonomy.json").read_text())
    schemes = json.loads((HERE / "marking_schemes.json").read_text())
    personas = json.loads((HERE / "personas.json").read_text())
    params = _load_params()

    submissions: list[dict[str, Any]] = []
    truth_rows: list[dict[str, Any]] = []

    for learner in personas["learners"]:
        lid, traits = learner["learner_id"], learner["traits"]
        assigned = learner["assigned_misconceptions"]
        for scheme in schemes["assessments"]:
            aid = scheme["assessment_id"]
            if aid in traits["missing_assessments"]:
                continue
            rng = random.Random(f"{SEED}:{lid}:{aid}")
            for q in scheme["questions"]:
                relevant = [n for n in assigned if _node_topic(taxonomy, n) == q["topic"]]
                careless = rng.random() < traits["careless_rate"]
                if q["type"] == "mcq":
                    answer, node, kind = choose_mcq_option(q, relevant, careless, rng)
                    text, noisy = answer, False
                else:
                    text, node, kind = build_written(q, relevant, careless, rng, params[aid])
                    noisy = traits["second_language"] and traits["language_noise_level"] > 0
                    if noisy:
                        clean = text
                        text = apply_language_noise(text, traits["language_noise_level"], rng)
                        assert math_tokens(clean) == math_tokens(text) or \
                            sorted(math_tokens(clean)) == sorted(math_tokens(text)), \
                            f"noise changed the mathematics on {lid} {q['question_id']}"
                    answer = text
                submissions.append({
                    "submission_id": f"{aid}-{lid}-{q['question_id']}",
                    "learner_id": lid, "learner_name": learner["name"],
                    "assessment_id": aid, "question_id": q["question_id"],
                    "topic": q["topic"], "type": q["type"], "answer": answer,
                    "submitted_at": f"2026-0{scheme['assessment_id'][1]}-12T09:00:00Z",
                })
                truth_rows.append({
                    "learner_id": lid, "assessment_id": aid, "question_id": q["question_id"],
                    "topic": q["topic"], "type": q["type"], "injected_node": node,
                    "injected_kind": kind, "language_noise_applied": noisy,
                })

    (HERE / "generated").mkdir(exist_ok=True)
    (HERE / "generated" / "submissions.json").write_text(json.dumps({
        "version": "1.0", "seed": SEED, "cohort_id": personas["cohort_id"],
        "cohort_label": personas["cohort_label"],
        "assessments_expected": personas["assessments_expected"],
        "learners": [{"learner_id": l["learner_id"], "name": l["name"]} for l in personas["learners"]],
        "submissions": submissions,
    }, indent=2) + "\n")
    (HERE / "ground_truth.json").write_text(json.dumps({
        "version": "1.0", "seed": SEED,
        "assignments": {l["learner_id"]: l["assigned_misconceptions"] for l in personas["learners"]},
        "traits": {l["learner_id"]: l["traits"] for l in personas["learners"]},
        "responses": truth_rows,
    }, indent=2) + "\n")
    print(f"generated {len(submissions)} submissions across "
          f"{len({s['learner_id'] for s in submissions})} learners")


def _node_topic(taxonomy: dict[str, Any], node_id: str) -> str | None:
    for node in taxonomy["nodes"]:
        if node["id"] == node_id:
            return node["topic"]
    return None


def _load_params() -> dict[str, Any]:
    import importlib.util
    spec = importlib.util.spec_from_file_location("bms", HERE / "build_marking_schemes.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.PARAMS


if __name__ == "__main__":
    generate()
