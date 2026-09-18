"""Reads a test paper (questions, correct answers and marking criteria).

CSV and JSON both reduce to the same raw rows, and one validator judges every
row, so the two formats cannot disagree about what a valid question is.
"""

from __future__ import annotations

import csv
import io
import json
import math
import re
from dataclasses import dataclass, field
from typing import Any

from backend import config
from backend.lms import mock_api
from backend.uploads.validate import Issues

COLUMNS = ("number", "type", "topic", "marks", "question", "correct", "option_a", "option_b",
           "option_c", "option_d", "model_answer", "criteria")
REQUIRED = ("number", "type", "marks", "question")
LETTERS = ("a", "b", "c", "d")
UNTAGGED = {"", "other", "none", "n/a", "na", "-", "untagged", "general"}
_ALIASES = {
    "q": "number", "no": "number", "num": "number", "question_number": "number",
    "question_type": "type", "mark": "marks", "points": "marks", "question_text": "question",
    "prompt": "question", "answer": "correct", "correct_answer": "correct",
    "correct_option": "correct", "modelanswer": "model_answer", "marking_criteria": "criteria",
    "scheme": "criteria", "marking_scheme": "criteria",
}
_TYPES = {"mcq": "mcq", "multiple_choice": "mcq", "multiple choice": "mcq", "mc": "mcq",
          "written": "written", "short_answer": "written", "short answer": "written",
          "open": "written", "long_answer": "written"}


@dataclass
class Question:
    number: int
    type: str
    topic: str
    marks: int | float
    prompt: str
    options: dict[str, str] = field(default_factory=dict)
    correct: str = ""
    model_answer: str = ""
    scheme: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class Paper:
    title: str | None
    questions: list[Question]


def normalise_header(header: str) -> str:
    key = re.sub(r"[\s\-]+", "_", header.strip().lower().lstrip("\ufeff"))
    return _ALIASES.get(key, key)


def _delimiter(text: str) -> str:
    first = next((line for line in text.splitlines() if line.strip()), "")
    return max((",", ";", "\t"), key=first.count)


def parse_paper(name: str, text: str, issues: Issues) -> Paper | None:
    """Returns the paper, or None when nothing usable could be read from it."""
    if name.lower().endswith(".json"):
        title, raws = _raws_from_json(name, text, issues)
    else:
        title, raws = None, _raws_from_csv(name, text, issues)
    if raws is None:
        return None
    questions = _validate_rows(name, raws, issues)
    if not questions and not issues.errors:
        issues.error(name, "whole file", "No questions were found in this file.")
    if len(questions) > config.UPLOAD_MAX_QUESTIONS:
        issues.error(name, "whole file", f"This test has {len(questions)} questions. "
                     f"The most we can take is {config.UPLOAD_MAX_QUESTIONS}.")
    return Paper(title=title, questions=sorted(questions, key=lambda q: q.number))


def _raws_from_csv(name: str, text: str, issues: Issues) -> list[tuple[str, dict[str, Any]]] | None:
    try:
        rows = list(csv.reader(io.StringIO(text), delimiter=_delimiter(text)))
    except csv.Error as exc:
        issues.error(name, "whole file", f"This does not read as a CSV file ({exc}).")
        return None
    numbered = [(i, r) for i, r in enumerate(rows, start=1) if any(c.strip() for c in r)]
    if not numbered:
        return []
    header = [normalise_header(h) for h in numbered[0][1]]
    missing = [c for c in REQUIRED if c not in header]
    if missing:
        issues.error(name, "Row 1", f"The header row is missing the column {_or_list(missing)}. "
                     f"Use our template so the column names match.")
        return None
    extra = [h for h in header if h and h not in COLUMNS]
    if extra:
        issues.warn(name, "Row 1", f"These columns are not used and will be ignored: "
                    f"{', '.join(extra)}.")
    out: list[tuple[str, dict[str, Any]]] = []
    for index, row in numbered[1:]:
        cells = [c.strip() for c in row] + [""] * (len(header) - len(row))
        out.append((f"Row {index}", dict(zip(header, cells))))
    return out


def _or_list(items: list[str]) -> str:
    quoted = [f"'{i}'" for i in items]
    return quoted[0] if len(quoted) == 1 else f"{', '.join(quoted[:-1])} and {quoted[-1]}"


def _raws_from_json(name: str, text: str, issues: Issues
                    ) -> tuple[str | None, list[tuple[str, dict[str, Any]]] | None]:
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        issues.error(name, f"Line {exc.lineno}, column {exc.colno}",
                     f"This is not valid JSON: {exc.msg}.")
        return None, None
    title = None
    if isinstance(data, dict):
        title = str(data.get("title") or data.get("name") or "").strip() or None
        data = data.get("questions")
    if not isinstance(data, list):
        issues.error(name, "whole file", "Expected a list of questions, either on its own or "
                     "under a 'questions' key.")
        return title, None
    out = []
    for index, item in enumerate(data, start=1):
        if not isinstance(item, dict):
            issues.error(name, f"Question {index}", "Each question must be an object.")
            continue
        out.append((f"Question {index}", _flatten_json_question(item)))
    return title, out


def _flatten_json_question(item: dict[str, Any]) -> dict[str, Any]:
    """Maps a JSON question onto the CSV column names. Options may be an object
    keyed a to d, a list, or already flat as option_a to option_d."""
    raw = {normalise_header(str(k)): v for k, v in item.items()}
    options = raw.pop("options", None)
    if isinstance(options, dict):
        for key, value in options.items():
            raw[f"option_{str(key).strip().lower()}"] = value
    elif isinstance(options, list):
        for letter, value in zip(LETTERS, options):
            raw[f"option_{letter}"] = value
    return raw


def _text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def _validate_rows(name: str, raws: list[tuple[str, dict[str, Any]]], issues: Issues
                   ) -> list[Question]:
    questions: list[Question] = []
    seen: dict[int, str] = {}
    for loc, raw in raws:
        before = len(issues.errors)
        question = _build_question(name, loc, raw, issues)
        if question is None or len(issues.errors) > before:
            continue
        if question.number in seen:
            issues.error(name, f"{loc}, number", f"Question {question.number} is already used "
                         f"on {seen[question.number]}. Each question needs its own number.")
            continue
        seen[question.number] = loc
        questions.append(question)
    return questions


def _build_question(name: str, loc: str, raw: dict[str, Any], issues: Issues) -> Question | None:
    number = _parse_number(_text(raw.get("number")))
    if number is None:
        issues.error(name, f"{loc}, number", "The question number is missing or is not a "
                     "whole number such as 3.")
        return None
    kind = _TYPES.get(_text(raw.get("type")).lower())
    if kind is None:
        issues.error(name, f"{loc}, type", f"Question {number}: the type must be 'mcq' or "
                     f"'written'.")
    marks = _parse_marks(_text(raw.get("marks")))
    if marks is None:
        issues.error(name, f"{loc}, marks", f"Question {number}: the marks must be a number "
                     f"above zero.")
    prompt = _text(raw.get("question"))
    if not prompt:
        issues.error(name, f"{loc}, question", f"Question {number} has no question text.")
    question = Question(number=number, type=kind or "written", topic=_parse_topic(
        name, loc, number, _text(raw.get("topic")), issues), marks=marks or 0, prompt=prompt,
        model_answer=_text(raw.get("model_answer")))
    if kind == "mcq":
        _read_mcq(name, loc, raw, question, issues)
    elif kind == "written" and marks:
        _read_written(name, loc, raw, question, issues)
    return question


def _parse_number(text: str) -> int | None:
    match = re.fullmatch(r"(?:q(?:uestion)?\s*)?0*(\d{1,3})[.)]?", text.strip().lower())
    return int(match.group(1)) if match and int(match.group(1)) > 0 else None


def _parse_marks(text: str) -> int | float | None:
    try:
        value = float(text)
    except ValueError:
        return None
    if not math.isfinite(value) or value <= 0 or value > 100:
        return None
    return int(value) if value.is_integer() else value


def _parse_topic(name: str, loc: str, number: int, value: str, issues: Issues) -> str:
    """A topic id, or an empty string for an untagged question."""
    if value.strip().lower() in UNTAGGED:
        return ""
    topics = mock_api.taxonomy()["topics"]
    wanted = re.sub(r"\s+", " ", value.strip()).lower()
    for topic in topics:
        if wanted in (topic["id"].lower(), re.sub(r"\s+", " ", topic["label"]).lower()):
            return topic["id"]
    issues.error(name, f"{loc}, topic", f"Question {number}: we don't recognise the topic "
                 f"'{value}'. Use T1 to T7, the exact topic name from the template, or leave "
                 f"it blank.")
    return ""


def _read_mcq(name: str, loc: str, raw: dict[str, Any], question: Question,
              issues: Issues) -> None:
    options = {l: _text(raw.get(f"option_{l}")) for l in LETTERS}
    question.options = {l: t for l, t in options.items() if t}
    if len(question.options) < 2:
        issues.error(name, f"{loc}, options", f"Question {question.number} is multiple choice "
                     f"but has fewer than two options. Fill in option_a to option_d.")
        return
    given = _text(raw.get("correct"))
    letter = _correct_letter(given, question.options)
    if letter is None:
        issues.error(name, f"{loc}, correct", f"Question {question.number}: the correct answer "
                     f"'{given}' is not one of the options. Give one of the letters "
                     f"{', '.join(sorted(question.options))}.")
        return
    question.correct = letter
    question.model_answer = question.model_answer or question.options[letter]


def _correct_letter(given: str, options: dict[str, str]) -> str | None:
    cleaned = re.sub(r"^(?:option\s*)?([a-d])[\).:]?$", r"\1", given.strip().lower())
    if cleaned in options:
        return cleaned
    matches = [l for l, t in options.items() if t.strip().lower() == given.strip().lower()]
    return matches[0] if len(matches) == 1 else None


def _read_written(name: str, loc: str, raw: dict[str, Any], question: Question,
                  issues: Issues) -> None:
    if not question.model_answer:
        issues.warn(name, f"{loc}, model_answer", f"Question {question.number} has no model "
                    f"answer, so marking will rely on the criteria alone.")
    scheme = _parse_criteria(name, loc, question, raw.get("criteria"), issues)
    if scheme is None:
        return
    if not scheme and not question.model_answer:
        issues.error(name, f"{loc}, criteria", f"Question {question.number} is written but has "
                     f"neither marking criteria nor a model answer, so there is nothing to "
                     f"mark it against.")
        return
    if not scheme:
        scheme = [{"marks": question.marks, "criterion": "Gives an answer that matches the "
                                                          "model answer"}]
        issues.warn(name, f"{loc}, criteria", f"Question {question.number} has no criteria. "
                    f"All {question.marks} marks will be awarded for matching the model answer.")
    total = sum(c["marks"] for c in scheme)
    if abs(total - question.marks) > 1e-9:
        issues.error(name, f"{loc}, criteria", f"Question {question.number}: the criteria add "
                     f"up to {total:g} marks but the question is worth {question.marks:g}.")
        return
    question.scheme = scheme


def _split_pipe(part: str) -> tuple[str, str]:
    marks, _, text = part.partition("|")
    return marks, text


def _parse_criteria(name: str, loc: str, question: Question, value: Any,
                    issues: Issues) -> list[dict[str, Any]] | None:
    """[] when blank, None when malformed, otherwise [{marks, criterion}]."""
    if isinstance(value, list):
        parts = [(c.get("marks"), c.get("text") or c.get("criterion")) if isinstance(c, dict)
                 else _split_pipe(str(c)) for c in value]
    else:
        parts = [_split_pipe(p) for p in re.split(r"[;\n]", _text(value)) if p.strip()]
    scheme: list[dict[str, Any]] = []
    for marks_text, criterion in parts:
        marks, text = _parse_marks(_text(marks_text)), _text(criterion)
        if marks is None or not text:
            issues.error(name, f"{loc}, criteria", f"Question {question.number}: each criterion "
                         f"needs marks and a description, written like "
                         f"1|Finds a common denominator, with criteria separated by a semicolon.")
            return None
        scheme.append({"marks": marks, "criterion": text})
    return scheme


def resolve_choice(question: Question, raw: str) -> tuple[str, str | None, bool]:
    """Turns a multiple-choice cell into (answer text, option letter, recognised).

    A learner's cell may hold the letter, the letter with its text, or the text
    alone. The stored answer is always the option text with the letter beside it,
    which is how the demo data is stored and what the marker compares against.
    Anything unrecognised is kept verbatim with no letter, so it is marked wrong
    rather than guessed at. Written answers and blanks pass through untouched.
    """
    text = raw.strip()
    if question.type != "mcq" or not text:
        return text, None, True
    for letter, option in question.options.items():
        if option.strip().lower() == text.lower():
            return option, letter, True
    match = re.match(r"^(?:option\s*)?([a-d])(?:\s*[\).:-]\s*.*)?$", text, re.IGNORECASE | re.DOTALL)
    letter = match.group(1).lower() if match else ""
    if letter in question.options:
        return question.options[letter], letter, True
    return text, None, False
