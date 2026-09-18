"""Reads student answer sheets.

Three shapes are accepted: one wide CSV with a row per student, one text or
markdown file per student (or several students in one file), and JSON. All of
them reduce to a list of Sheet, so the checks that compare sheets with the paper
run once, whatever format the teacher happened to have.
"""

from __future__ import annotations

import csv
import io
import json
import re
from dataclasses import dataclass, field
from typing import Any

from backend.uploads.validate import Issues, clean_email

_ID_KEYS = {"student_id", "id", "studentid", "student_no", "student_number", "learner_id"}
_NAME_KEYS = {"name", "student_name", "student", "full_name", "learner", "learner_name"}
_EMAIL_KEYS = {"email", "email_address", "e_mail", "e-mail"}
_QUESTION_KEY = re.compile(r"^q(?:uestion)?[\s_]*0*(\d{1,3})$|^0*(\d{1,3})$")
_TXT_HEADER = re.compile(r"^\W*(student(?:[\s_]*id)?|id|name|email)\W*[:=][\s*]*(.*?)[\s*]*$",
                         re.IGNORECASE)
_TXT_ANSWER = re.compile(r"^[#*\s-]*q(?:uestion)?[\s_]*0*(\d{1,3})\s*[:.)]\s*\**\s*(.*)$",
                         re.IGNORECASE)


@dataclass
class Sheet:
    ref: str
    name: str
    email: str
    answers: dict[int, str] = field(default_factory=dict)
    file: str = ""
    where: str = ""


@dataclass
class SheetFile:
    sheets: list[Sheet]
    # Question numbers that exist as columns. Only a wide CSV has columns, so this
    # is None for the other shapes and the absence is judged per student instead.
    columns: set[int] | None = None


def parse_sheet_file(name: str, text: str, issues: Issues) -> SheetFile:
    lower = name.lower()
    if lower.endswith(".csv"):
        return _parse_wide_csv(name, text, issues)
    if lower.endswith(".json"):
        return SheetFile(_parse_json(name, text, issues))
    return SheetFile(_parse_text(name, text, issues))


def question_number(key: str) -> int | None:
    match = _QUESTION_KEY.match(re.sub(r"[\s_]+", "_", key.strip().lower()).replace("_", ""))
    if not match:
        return None
    value = int(match.group(1) or match.group(2))
    return value if value > 0 else None


# --- wide CSV -----------------------------------------------------------------

def _delimiter(text: str) -> str:
    first = next((line for line in text.splitlines() if line.strip()), "")
    return max((",", ";", "\t"), key=first.count)


def _parse_wide_csv(name: str, text: str, issues: Issues) -> SheetFile:
    try:
        rows = list(csv.reader(io.StringIO(text), delimiter=_delimiter(text)))
    except csv.Error as exc:
        issues.error(name, "whole file", f"This does not read as a CSV file ({exc}).")
        return SheetFile([])
    numbered = [(i, r) for i, r in enumerate(rows, start=1) if any(c.strip() for c in r)]
    header = [re.sub(r"[\s\-]+", "_", h.strip().lower().lstrip("\ufeff")) for h in numbered[0][1]]
    id_col, name_col, email_col = (_find(header, keys) for keys in (_ID_KEYS, _NAME_KEYS,
                                                                    _EMAIL_KEYS))
    questions = {i: number for i, h in enumerate(header) if (number := question_number(h))}
    if id_col is None and name_col is None:
        issues.error(name, "Row 1", "The header row needs a 'student_id' column, or at least a "
                     "'name' column. Use our template so the column names match.")
        return SheetFile([])
    if id_col is None:
        issues.warn(name, "Row 1", "There is no student_id column, so student names will be "
                    "used to match the same student across tests.")
    known = {i for i in (id_col, name_col, email_col) if i is not None} | set(questions)
    extra = [h for i, h in enumerate(header) if i not in known and h]
    if extra:
        issues.warn(name, "Row 1", f"These columns are not used and will be ignored: "
                    f"{', '.join(extra)}.")
    sheets = [_row_sheet(name, index, row, id_col, name_col, email_col, questions, issues)
              for index, row in numbered[1:]]
    return SheetFile([s for s in sheets if s], columns=set(questions.values()))


def _find(header: list[str], keys: set[str]) -> int | None:
    return next((i for i, h in enumerate(header) if h in keys), None)


def _row_sheet(name: str, index: int, row: list[str], id_col: int | None, name_col: int | None,
               email_col: int | None, questions: dict[int, int], issues: Issues) -> Sheet | None:
    def cell(col: int | None) -> str:
        return row[col].strip() if col is not None and col < len(row) else ""

    ref, student = cell(id_col), cell(name_col)
    if not ref and not student:
        issues.error(name, f"Row {index}", "This row has no student id or name.")
        return None
    answers = {number: cell(col) for col, number in questions.items()}
    return _finish(Sheet(ref or student, student or ref, cell(email_col), answers, name,
                         f"Row {index}"), issues)


def _finish(sheet: Sheet, issues: Issues) -> Sheet:
    """Applies the checks every format shares: the name fallback and the email."""
    given = sheet.email
    sheet.email = clean_email(given)
    if given and not sheet.email:
        issues.warn(sheet.file, sheet.where, f"'{given}' does not look like an email address, "
                    f"so no email is saved for {sheet.name}. You can add it later on the "
                    f"Students page.")
    return sheet


# --- text and markdown ----------------------------------------------------------

def _parse_text(name: str, text: str, issues: Issues) -> list[Sheet]:
    sheets: list[Sheet] = []
    current: Sheet | None = None
    open_question: int | None = None
    fields: dict[str, str] = {}
    start, orphaned = 0, False

    def close() -> None:
        nonlocal current, fields
        if current is None and fields:
            current = _sheet_from_fields(name, fields, start, issues)
        if current is not None:
            for number, value in current.answers.items():
                current.answers[number] = value.strip()
            sheets.append(_finish(current, issues))
        current, fields = None, {}

    for line_no, line in enumerate(text.split("\n"), start=1):
        answer = _TXT_ANSWER.match(line)
        header = None if answer else _TXT_HEADER.match(line)
        if header and (open_question is None or header.group(1).lower().startswith("student")):
            if open_question is not None:
                close()
                open_question = None
            if not fields:
                start, orphaned = line_no, False
            fields[_field_key(header.group(1))] = header.group(2).strip()
        elif answer:
            if current is None and not orphaned:
                current = _sheet_from_fields(name, fields, start or line_no, issues)
                orphaned = current is None
            if current is not None:
                open_question = int(answer.group(1))
                current.answers[open_question] = answer.group(2)
        elif open_question is not None and current is not None:
            current.answers[open_question] += "\n" + line
    close()
    if not sheets:
        issues.error(name, "whole file", "No student was found. Start each student with a line "
                     "like 'Student: 101' and give answers as 'Q1: ...'.")
    return sheets


def _field_key(label: str) -> str:
    label = label.lower()
    return "ref" if label.startswith("student") or label == "id" else label


def _sheet_from_fields(name: str, fields: dict[str, str], line_no: int,
                       issues: Issues) -> Sheet | None:
    ref, student = fields.get("ref", ""), fields.get("name", "")
    if not ref and not student:
        issues.error(name, f"Line {line_no}", "Answers appear before any 'Student:' or 'Name:' "
                     "line, so we can't tell whose they are.")
        return None
    return Sheet(ref or student, student or ref, fields.get("email", ""), {}, name,
                 f"Line {line_no}")


# --- JSON -----------------------------------------------------------------------

def _parse_json(name: str, text: str, issues: Issues) -> list[Sheet]:
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        issues.error(name, f"Line {exc.lineno}, column {exc.colno}",
                     f"This is not valid JSON: {exc.msg}.")
        return []
    if isinstance(data, dict) and "students" in data:
        data = data["students"]
    if isinstance(data, dict):
        data = [data]
    if not isinstance(data, list):
        issues.error(name, "whole file", "Expected a list of students, or an object with a "
                     "'students' list.")
        return []
    sheets = [_json_sheet(name, i, item, issues) for i, item in enumerate(data, start=1)]
    return [s for s in sheets if s]


def _json_sheet(name: str, index: int, item: Any, issues: Issues) -> Sheet | None:
    where = f"Student {index}"
    if not isinstance(item, dict):
        issues.error(name, where, "Each student must be an object.")
        return None
    flat = {re.sub(r"[\s\-]+", "_", str(k).strip().lower()): v for k, v in item.items()}
    pick = lambda keys: next((str(flat[k]).strip() for k in keys if flat.get(k) not in (None, "")),
                             "")
    ref, student = pick(_ID_KEYS), pick(_NAME_KEYS)
    if not ref and not student:
        issues.error(name, where, "This student has no id or name.")
        return None
    return _finish(Sheet(ref or student, student or ref, pick(_EMAIL_KEYS),
                         _json_answers(flat), name, where), issues)


def _json_answers(flat: dict[str, Any]) -> dict[int, str]:
    raw = flat.get("answers", flat)
    if isinstance(raw, list):
        return {i: "" if v is None else str(v).strip() for i, v in enumerate(raw, start=1)}
    if not isinstance(raw, dict):
        return {}
    out: dict[int, str] = {}
    for key, value in raw.items():
        number = question_number(str(key))
        if number:
            out[number] = "" if value is None else str(value).strip()
    return out
