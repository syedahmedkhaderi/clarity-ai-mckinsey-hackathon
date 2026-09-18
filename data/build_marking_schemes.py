"""Builds data/marking_schemes.json.

Kept as a script so the 32 questions stay internally consistent and any edit to
the number set regenerates every dependent field. Run:
    python data/build_marking_schemes.py
"""

from __future__ import annotations

import json
from fractions import Fraction
from pathlib import Path
from typing import Any

OUT = Path(__file__).parent / "marking_schemes.json"

# Per assessment: the concrete numbers each question template is instantiated with.
PARAMS: dict[str, dict[str, Any]] = {
    "A1": {
        "q1_expr": (2, 5, 3), "q2_dec": (0.4, 0.35), "q3_neg": (4, 7),
        "q4_frac": (1, 2, 1, 3), "q5_frac": (1, 4), "q6_ratio": (2, 3, 40, "Priya", "Sam"),
        "q7_frac": (4, 6), "q8_frac": (1, 5, 1, 2),
    },
    "A2": {
        "q1_expr": (3, 4, 2), "q2_dec": (0.7, 0.65), "q3_neg": (6, 9),
        "q4_frac": (1, 4, 1, 6), "q5_frac": (2, 5), "q6_ratio": (3, 5, 64, "Ayesha", "Ravi"),
        "q7_frac": (6, 9), "q8_frac": (1, 3, 1, 6),
    },
    "A3": {
        "q1_expr": (2, 3, 4), "q2_dec": (0.9, 0.75), "q3_neg": (5, 3),
        "q4_frac": (1, 3, 1, 4), "q5_frac": (3, 5), "q6_ratio": (3, 4, 56, "Lerato", "Dineo"),
        "q7_frac": (6, 8), "q8_frac": (1, 2, 1, 5),
    },
    "A4": {
        "q1_expr": (5, 2, 3), "q2_dec": (0.6, 0.45), "q3_neg": (8, 2),
        "q4_frac": (2, 5, 1, 3), "q5_frac": (7, 10), "q6_ratio": (2, 5, 49, "Kofi", "Ama"),
        "q7_frac": (9, 12), "q8_frac": (1, 6, 1, 4),
    },
}


def _fmt(f: Fraction) -> str:
    return f"{f.numerator}/{f.denominator}"


def _mcq_options(correct: str, wrong: list[tuple[str, str]]) -> tuple[dict[str, str], str, dict[str, str]]:
    """Places the correct answer at 'b' and the distractors around it."""
    letters = ["a", "b", "c", "d"]
    values = [wrong[0][0], correct, wrong[1][0], wrong[2][0]]
    nodes = [wrong[0][1], None, wrong[1][1], wrong[2][1]]
    options = dict(zip(letters, values))
    distractor_map = {ltr: node for ltr, node in zip(letters, nodes) if node}
    return options, "b", distractor_map


def build_assessment(aid: str, p: dict[str, Any]) -> dict[str, Any]:
    qs: list[dict[str, Any]] = []

    # Q1  T7  MCQ  order of operations
    a, b, c = p["q1_expr"]
    opts, correct, dmap = _mcq_options(
        str(a + b * c),
        [(str((a + b) * c), "M18"), (str(a * b + c), "M19"), (str(a + b + c), "M20")],
    )
    qs.append({
        "question_id": f"{aid}Q1", "topic": "T7", "type": "mcq", "max_marks": 1,
        "prompt": f"What is {a} + {b} x {c}?",
        "options": opts, "correct": correct, "distractor_map": dmap,
    })

    # Q2  T3  written  decimal place value
    d1, d2 = p["q2_dec"]
    qs.append({
        "question_id": f"{aid}Q2", "topic": "T3", "type": "written", "max_marks": 3,
        "prompt": (
            f"Work out {d1} + {d2}. Then say which of the two numbers, {d1} or {d2}, "
            f"is larger. Show your working."
        ),
        "model_answer": (
            f"Line up the decimal points: {d1:.2f} + {d2:.2f} = {d1 + d2:.2f}. "
            f"Comparing the tenths column, {max(d1, d2)} is the larger number."
        ),
        "scheme": [
            {"marks": 1, "criterion": f"Correct sum {d1 + d2:.2f}"},
            {"marks": 1, "criterion": f"States that {max(d1, d2)} is the larger number"},
            {"marks": 1, "criterion": "Working shows place value alignment rather than digit count"},
        ],
    })

    # Q3  T6  MCQ  negative numbers
    n1, n2 = p["q3_neg"]
    opts, correct, dmap = _mcq_options(
        str(n1 + n2),
        [(str(n1 - n2), "M16"), (str(-(n1 + n2)), "M17"), (str(-n1 - n2), "M15")],
    )
    qs.append({
        "question_id": f"{aid}Q3", "topic": "T6", "type": "mcq", "max_marks": 1,
        "prompt": f"What is {n1} - (-{n2})?",
        "options": opts, "correct": correct, "distractor_map": dmap,
    })

    # Q4  T2  written  adding fractions with unlike denominators
    a, b, c, d = p["q4_frac"]
    total = Fraction(a, b) + Fraction(c, d)
    lcm = (b * d) // _gcd(b, d)
    qs.append({
        "question_id": f"{aid}Q4", "topic": "T2", "type": "written", "max_marks": 3,
        "prompt": (
            f"A learner walks {a}/{b} km then {c}/{d} km. "
            f"How far did they walk in total? Show your working."
        ),
        "model_answer": (
            f"Common denominator {lcm}. {a * (lcm // b)}/{lcm} + {c * (lcm // d)}/{lcm} "
            f"= {_fmt(total)} km."
        ),
        "scheme": [
            {"marks": 1, "criterion": "Identifies a common denominator"},
            {"marks": 1, "criterion": "Converts both fractions correctly"},
            {"marks": 1, "criterion": f"Correct final answer {_fmt(total)} with unit"},
        ],
    })

    # Q5  T4  MCQ  fraction to percentage
    n, dn = p["q5_frac"]
    pct = 100 * n / dn
    qs.append({
        "question_id": f"{aid}Q5", "topic": "T4", "type": "mcq", "max_marks": 1,
        "prompt": f"What is {n}/{dn} as a percentage?",
        **dict(zip(
            ["options", "correct", "distractor_map"],
            _mcq_options(
                _pct(pct),
                [(_pct(round(100 * dn / n)), "M11"), (_pct(n * 10 + dn), "M14"), (f"{n / dn:g}%", "M10")],
            ),
        )),
    })

    # Q6  T5  written  sharing in a ratio
    r1, r2, total_amt, name1, name2 = p["q6_ratio"]
    share = total_amt // (r1 + r2)
    qs.append({
        "question_id": f"{aid}Q6", "topic": "T5", "type": "written", "max_marks": 3,
        "prompt": (
            f"{name1} and {name2} share {total_amt} seedlings in the ratio {r1}:{r2}. "
            f"How many does {name1} get? Show your working."
        ),
        "model_answer": (
            f"{r1} + {r2} = {r1 + r2} equal shares. {total_amt} / {r1 + r2} = {share} per share. "
            f"{name1} gets {r1} x {share} = {r1 * share}."
        ),
        "scheme": [
            {"marks": 1, "criterion": f"Adds the ratio parts to get {r1 + r2} shares"},
            {"marks": 1, "criterion": f"Divides the total to find one share is {share}"},
            {"marks": 1, "criterion": f"Correct final answer {r1 * share}"},
        ],
    })

    # Q7  T1  MCQ  simplifying fractions
    n, dn = p["q7_frac"]
    g = _gcd(n, dn)
    qs.append({
        "question_id": f"{aid}Q7", "topic": "T1", "type": "mcq", "max_marks": 1,
        "prompt": f"Write {n}/{dn} in its simplest form.",
        **dict(zip(
            ["options", "correct", "distractor_map"],
            _mcq_options(
                f"{n // g}/{dn // g}",
                [(f"{n - 2}/{dn - 2}", "M05"), (f"{dn // g}/{n // g}", "M04"), (f"{n}/{dn}", "M06")],
            ),
        )),
    })

    # Q8  T2  MCQ  adding fractions
    a, b, c, d = p["q8_frac"]
    total = Fraction(a, b) + Fraction(c, d)
    lcm = (b * d) // _gcd(b, d)
    qs.append({
        "question_id": f"{aid}Q8", "topic": "T2", "type": "mcq", "max_marks": 1,
        "prompt": f"What is {a}/{b} + {c}/{d}?",
        **dict(zip(
            ["options", "correct", "distractor_map"],
            _mcq_options(
                _fmt(total),
                [(f"{a + c}/{b + d}", "M01"), (f"{a + c}/{lcm}", "M02"), (f"{total.numerator + 1}/{total.denominator}", "M03")],
            ),
        )),
    })

    return {"assessment_id": aid, "topic_coverage": sorted({q["topic"] for q in qs}), "questions": qs}


def _gcd(x: int, y: int) -> int:
    while y:
        x, y = y, x % y
    return x


def _pct(v: float) -> str:
    return f"{v:g}%"


def main() -> None:
    data = {"version": "1.0", "assessments": [build_assessment(a, p) for a, p in PARAMS.items()]}
    OUT.write_text(json.dumps(data, indent=2) + "\n")
    n = sum(len(a["questions"]) for a in data["assessments"])
    print(f"wrote {OUT} with {len(data['assessments'])} assessments and {n} questions")


if __name__ == "__main__":
    main()
