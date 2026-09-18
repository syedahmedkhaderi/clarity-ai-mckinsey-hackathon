"""Deterministic marking and diagnosis rules.

Two roles:
1. The fallback every model call falls back to, so no provider failure can crash
   the graph or show a stack trace.
2. The whole engine when no API key is set, so the system is demoable offline.

These rules read the marking scheme and the taxonomy. They never read
data/ground_truth.json. Honest caveat, also stated in eval/results.md: because
these rules encode the same mathematics the generator used to inject the errors,
a recovery rate measured in offline mode is a check that the pipeline is wired
correctly, not a measurement of model quality.
"""

from __future__ import annotations

import re
from fractions import Fraction
from typing import Any

from backend.lms import mock_api
from backend.models import Diagnosis, Mark

LANGUAGE_CLASS_NODES = {"M21", "M22", "M23", "M24"}
NO_PATTERN = ("Marks were lost but the working does not match any misconception pattern for "
              "this topic. It may be a one-off slip rather than a misconception, which is a "
              "judgement for a person.")
PLACE_VALUE_WORDS = ("line up", "lining", "lined", "two places", "tenths", "hundredths",
                     "column", "decimal point", "points under", "place value")


def _has_number(text: str, value: Any) -> bool:
    """Word-boundary match so 7 does not match inside 27."""
    return re.search(rf"(?<![\d./]){re.escape(str(value))}(?![\d/])", text) is not None


def _has_fraction(text: str, num: int, den: int) -> bool:
    return re.search(rf"(?<!\d){num}\s*/\s*{den}(?!\d)", text) is not None


def _params(question: dict[str, Any]) -> dict[str, Any]:
    """Recovers the numbers from the question prompt and model answer. Keeps this
    module independent of the generator."""
    nums = [float(n) if "." in n else int(n)
            for n in re.findall(r"-?\d+\.\d+|-?\d+", question["prompt"])]
    return {"nums": nums}


# --- marking ---------------------------------------------------------------

def mark_written_offline(question: dict[str, Any], sub: Any) -> Mark:
    slot = question["question_id"][2:]
    checker = {"Q2": _check_q2, "Q4": _check_q4, "Q6": _check_q6}.get(slot)
    scheme = question["scheme"]
    answer = sub.answer
    met_flags = checker(question, answer) if checker else [False] * len(scheme)

    met = [c["criterion"] for c, ok in zip(scheme, met_flags) if ok]
    missed = [c["criterion"] for c, ok in zip(scheme, met_flags) if not ok]
    awarded = float(sum(c["marks"] for c, ok in zip(scheme, met_flags) if ok))
    confidence = 0.88
    if missed and met_flags and met_flags[-1]:
        # Final value right, presentation criteria missing. Readable but not clean.
        confidence = 0.72
    if not met:
        confidence = 0.9
    return Mark(question_id=question["question_id"], learner_id=sub.learner_id,
                awarded=awarded, max_marks=float(question["max_marks"]),
                confidence=confidence, criteria_met=met, criteria_missed=missed,
                source="fallback")


def _check_q2(question: dict[str, Any], answer: str) -> list[bool]:
    nums = re.findall(r"\d+\.\d+", question["prompt"])
    d1, d2 = float(nums[0]), float(nums[1])
    total, larger = round(d1 + d2, 2), max(d1, d2)
    c0 = _has_number(answer, f"{total:g}")
    stated = _stated_larger(answer)
    c1 = stated is not None and abs(stated - larger) < 1e-9
    c2 = c0 and any(w in answer.lower() for w in PLACE_VALUE_WORDS)
    return [c0, c1, c2]


def _stated_larger(answer: str) -> float | None:
    """The number in the clause that claims something is larger."""
    for sentence in _sentences(answer):
        low = sentence.lower()
        if "larger" in low or "bigger" in low or "larger one" in low:
            found = re.findall(r"\d+\.\d+", sentence)
            if found:
                return float(found[0])
    return None


def _check_q4(question: dict[str, Any], answer: str) -> list[bool]:
    a, b, c, d = _frac_pairs(question["prompt"])
    lcm = (b * d) // _gcd(b, d)
    a2, c2 = a * (lcm // b), c * (lcm // d)
    total = Fraction(a, b) + Fraction(c, d)
    return [
        _has_number(answer, lcm) or _has_fraction(answer, a2, lcm),
        _has_fraction(answer, a2, lcm) and _has_fraction(answer, c2, lcm),
        _has_fraction(answer, total.numerator, total.denominator) and "km" in answer.lower(),
    ]


def _check_q6(question: dict[str, Any], answer: str) -> list[bool]:
    r1, r2, total = _ratio_parts(question["prompt"])
    shares, one = r1 + r2, total // (r1 + r2)
    return [_has_number(answer, shares), _has_number(answer, one),
            _has_number(answer, r1 * one)]


# --- diagnosis -------------------------------------------------------------

def diagnose_offline(question: dict[str, Any], sub: Any, mark: Mark) -> Diagnosis:
    slot = question["question_id"][2:]
    rule = {"Q2": _diag_q2, "Q4": _diag_q4, "Q6": _diag_q6}.get(slot)
    node, alt, confidence, span, reason = rule(question, sub.answer) if rule else (
        None, None, 0.2, "", "No deterministic rule matched this response.")
    meta = _node_meta(node)
    return Diagnosis(
        question_id=question["question_id"], learner_id=sub.learner_id,
        taxonomy_node=node, alternative_node=alt,
        # The rules match one signature exactly, so the runner-up is genuinely far
        # behind. It is named for the facilitator's benefit, not because it is close.
        alternative_confidence=round(max(0.0, 1.0 - confidence) * 0.35, 2) if alt else 0.0,
        error_class=meta.get("error_class", "unclassified"),
        confidence=confidence, evidence_span=span, reasoning=reason,
        language_flag=node in LANGUAGE_CLASS_NODES if node else False,
        source="fallback", topic=question["topic"],
    )


def _diag_q4(question: dict[str, Any], answer: str) -> tuple:
    a, b, c, d = _frac_pairs(question["prompt"])
    lcm = (b * d) // _gcd(b, d)
    a2, c2 = a * (lcm // b), c * (lcm // d)
    total = Fraction(a, b) + Fraction(c, d)
    if _has_fraction(answer, a + c, b + d):
        return ("M01", "M02", 0.91, _span(answer, f"{a + c}/{b + d}"),
                "The answer shows the numerators added and the denominators added, which "
                "is the signature of adding without a common denominator.")
    if _has_fraction(answer, a + c, lcm):
        return ("M02", "M01", 0.88, _span(answer, f"{a + c}/{lcm}"),
                "The common denominator is correct but the numerators were carried over "
                "unchanged, so the fractions were never rescaled.")
    if _has_fraction(answer, total.numerator, total.denominator):
        return ("M21", None, 0.86, _span(answer, f"{total.numerator}/{total.denominator}"),
                "The final value is correct, so the mathematics holds. The marks lost are "
                "in how the working is written, which is a language issue, not a "
                "misconception.")
    for offset in (1, -1):
        if _has_fraction(answer, a2 + c2 + offset, lcm):
            return ("M03", "M02", 0.84, _span(answer, f"{a2 + c2 + offset}/{lcm}"),
                    "The common denominator and both conversions are right, so only the "
                    "final addition slipped.")
    return (None, None, 0.25, "", NO_PATTERN)


def _diag_q2(question: dict[str, Any], answer: str) -> tuple:
    nums = re.findall(r"\d+\.\d+", question["prompt"])
    d1, d2 = float(nums[0]), float(nums[1])
    total, larger = round(d1 + d2, 2), max(d1, d2)
    stated = _stated_larger(answer)
    misaligned = round(_m08_value(d1, d2), 3)
    if _has_number(answer, f"{misaligned:g}"):
        return ("M08", "M09", 0.87, _span(answer, f"{misaligned:g}"),
                "The sum is what you get by lining the last digits up instead of the "
                "decimal points.")
    if _has_number(answer, f"{round((d1 + d2) * 10, 2):g}"):
        return ("M09", "M08", 0.85, _span(answer, f"{round((d1 + d2) * 10, 2):g}"),
                "The sum is correct in its digits but a factor of ten out, so the point "
                "moved one place too far.")
    if stated is not None and abs(stated - larger) > 1e-9:
        return ("M07", "M09", 0.89, _span(answer, f"{stated:g}"),
                "The comparison ranks the number whose digits after the point read as a "
                "bigger whole number, so the decimal tail is being read as an integer.")
    if _has_number(answer, f"{total:g}"):
        return ("M24", None, 0.8, _span(answer, f"{total:g}"),
                "The value is right. What was lost is the form the question asked for, "
                "which points at the instruction wording rather than the mathematics.")
    return (None, None, 0.25, "", NO_PATTERN)


def _diag_q6(question: dict[str, Any], answer: str) -> tuple:
    r1, r2, total = _ratio_parts(question["prompt"])
    shares, one = r1 + r2, total // (r1 + r2)
    if _has_number(answer, total // 2) and not _has_number(answer, shares):
        return ("M13", "M12", 0.88, _span(answer, str(total // 2)),
                "The total was split by the number of people named rather than by the "
                "number of equal shares the ratio describes.")
    if _has_number(answer, r2 * one) and not _has_number(answer, r1 * one):
        return ("M22", "M13", 0.83, _span(answer, str(r2 * one)),
                "The method is correct and applied cleanly, but to the wrong person. That "
                "points at how the wording of the scenario was read.")
    if _has_number(answer, r1 + (total - r1 - r2) // 2):
        return ("M12", "M13", 0.86, _span(answer, str(r1 + (total - r1 - r2) // 2)),
                "The ratio numbers were handed out as absolute amounts and the remainder "
                "split evenly, which treats the ratio as a difference.")
    return (None, None, 0.25, "", NO_PATTERN)


def diagnose_mcq(question: dict[str, Any], sub: Any) -> Diagnosis | None:
    """No model call. The distractor map is authored alongside the question."""
    chosen = getattr(sub, "selected_option", None) or sub.answer.strip()
    if chosen not in question.get("options", {}):
        chosen = next((k for k, v in question["options"].items() if v == sub.answer.strip()),
                      chosen)
    node = question.get("distractor_map", {}).get(chosen)
    meta = _node_meta(node)
    if not node:
        return None
    return Diagnosis(
        question_id=question["question_id"], learner_id=sub.learner_id,
        taxonomy_node=node, alternative_node=None,
        error_class=meta.get("error_class", "unclassified"), confidence=0.95,
        evidence_span=question["options"][chosen],
        reasoning=f"Option {chosen}, \"{question['options'][chosen]}\", is mapped in the "
                  f"marking scheme to {node}: {meta.get('label', '')}.",
        language_flag=node in LANGUAGE_CLASS_NODES, source="distractor_map",
        topic=question["topic"],
    )


# --- helpers ---------------------------------------------------------------

SENTENCE_BREAK = re.compile(r"\.(?!\d)")


def _sentences(text: str) -> list[str]:
    """Splits on sentence stops only. A full stop between two digits is a decimal
    point, not the end of a sentence."""
    return [s for s in SENTENCE_BREAK.split(text) if s.strip()]


def _span(answer: str, needle: str) -> str:
    """Widens a match to the surrounding clause so the highlight reads naturally.
    Always returns a verbatim substring of the answer, or an empty string."""
    idx = answer.find(needle)
    if idx < 0:
        return ""
    starts = [m.end() for m in SENTENCE_BREAK.finditer(answer) if m.end() <= idx]
    start = starts[-1] if starts else 0
    ends = [m.end() for m in SENTENCE_BREAK.finditer(answer) if m.start() >= idx + len(needle)]
    end = ends[0] if ends else len(answer)
    return answer[start:end].strip()


def _frac_pairs(prompt: str) -> tuple[int, int, int, int]:
    pairs = re.findall(r"(\d+)/(\d+)", prompt)
    (a, b), (c, d) = (int(pairs[0][0]), int(pairs[0][1])), (int(pairs[1][0]), int(pairs[1][1]))
    return a, b, c, d


def _ratio_parts(prompt: str) -> tuple[int, int, int]:
    total = int(re.search(r"share (\d+)", prompt).group(1))
    r1, r2 = (int(x) for x in re.search(r"ratio (\d+):(\d+)", prompt).groups())
    return r1, r2, total


def _m08_value(d1: float, d2: float) -> float:
    places = lambda v: len(str(v).split(".")[1])
    shift = abs(places(d1) - places(d2))
    if places(d1) < places(d2):
        return d1 / (10 ** shift) + d2
    return d1 + d2 / (10 ** shift)


def _gcd(x: int, y: int) -> int:
    while y:
        x, y = y, x % y
    return x


def _node_meta(node_id: str | None) -> dict[str, Any]:
    if not node_id:
        return {}
    for node in mock_api.taxonomy()["nodes"]:
        if node["id"] == node_id:
            return node
    return {}
