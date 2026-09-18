"""Judges a whole upload: the paper, the answer sheets and how they fit together.

Preview and save both go through analyse(), so a teacher is never shown a green
tick for something the save step would then refuse.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import PurePosixPath
from typing import Any

from backend import config
from backend.lms import mock_api
from backend.uploads import store
from backend.uploads.parse_paper import Paper, parse_paper, resolve_choice
from backend.uploads.parse_sheets import Sheet, SheetFile, parse_sheet_file
from backend.uploads.validate import Issues, check_file, display_name, join_numbers

# A long list of near-identical warnings buries the one that matters.
WARNING_CAP = 6


@dataclass
class Analysis:
    issues: Issues
    paper: Paper | None = None
    sheets: list[Sheet] = field(default_factory=list)
    title: str = ""
    class_id: str | None = None
    class_name: str | None = None
    files: list[dict[str, str]] = field(default_factory=list)
    summary: dict[str, Any] = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return not self.issues.errors


def analyse(*, class_id: str | None, class_name: str | None, title: str | None,
            paper_file: tuple[str, str], sheet_files: list[tuple[str, str]]) -> Analysis:
    """Checks every file, then how they fit together. Raises UploadRejected for a
    file we cannot read at all; every other problem is reported as an issue."""
    issues = Issues()
    paper_text = check_file("paper", paper_file[0], paper_file[1], issues)
    sheet_texts = [(display_name(n), check_file("sheets", n, c, issues)) for n, c in sheet_files]
    result = Analysis(issues=issues, files=_file_names(paper_file, sheet_files))
    result.class_id, result.class_name = _resolve_target(class_id, class_name, issues)
    paper_name = display_name(paper_file[0])
    if paper_text is not None:
        result.paper = parse_paper(paper_name, paper_text, issues)
        _warn_untagged(paper_name, result.paper, issues)
    parsed = [(n, parse_sheet_file(n, t, issues)) for n, t in sheet_texts if t is not None]
    result.title = _title(title, result.paper, paper_name)
    if not sheet_files:
        issues.error("Answer sheets", "whole upload", "Add at least one answer sheet.")
    if len(sheet_files) > config.UPLOAD_MAX_STUDENTS:
        issues.error("Answer sheets", "whole upload", f"That is {len(sheet_files)} files. The "
                     f"most we can take at once is {config.UPLOAD_MAX_STUDENTS}.")
    if store.test_count() >= config.UPLOAD_MAX_TESTS:
        issues.error("Test", "whole upload", f"You already have {config.UPLOAD_MAX_TESTS} tests. "
                     f"Delete one to add another.")
    if result.paper is not None and result.paper.questions:
        result.sheets = _check_sheets(result.paper, parsed, result, issues)
    else:
        result.sheets = [s for _, sf in parsed for s in sf.sheets]
    result.summary = _summary(result)
    return result


def _file_names(paper: tuple[str, str], sheets: list[tuple[str, str]]) -> list[dict[str, str]]:
    return [{"role": "paper", "name": display_name(paper[0])},
            *({"role": "sheets", "name": display_name(n)} for n, _ in sheets)]


def _resolve_target(class_id: str | None, class_name: str | None,
                    issues: Issues) -> tuple[str | None, str | None]:
    """The existing class to add to (or None for a new one) and the new class's name.

    A client-supplied id is only ever checked against what is stored. A name that
    matches an existing class adds to that class rather than making a twin.
    """
    if class_id:
        if store.class_exists(class_id):
            return class_id, None
        issues.error("Class", "Class", "We could not find that class. Choose one from the list "
                     "or give a new class a name. The demo class cannot take uploaded tests.")
        return None, None
    name = re.sub(r"\s+", " ", (class_name or "").strip())[:80]
    if not name:
        issues.error("Class", "Class name", "Choose a class, or give the new class a name.")
        return None, None
    return store.find_class_by_name(name), name


def _warn_untagged(name: str, paper: Paper | None, issues: Issues) -> None:
    untagged = [q.number for q in paper.questions if not q.topic] if paper else []
    if untagged:
        verb = "has" if len(untagged) == 1 else "have"
        issues.warn(name, "topic", f"{join_numbers(untagged).capitalize()} {verb} no topic. "
                    f"{'It' if len(untagged) == 1 else 'They'} will be marked, but we will not "
                    f"look for mistake patterns there.")


def _title(given: str | None, paper: Paper | None, paper_name: str) -> str:
    title = (given or "").strip() or (paper.title if paper else None) or ""
    if not title:
        stem = re.sub(r"[_\-]+", " ", PurePosixPath(paper_name).stem).strip()
        title = stem[:1].upper() + stem[1:] if stem else "Untitled test"
    return title[:120]


# --- paper and sheets together ----------------------------------------------------

def _check_sheets(paper: Paper, parsed: list[tuple[str, SheetFile]], result: Analysis,
                  issues: Issues) -> list[Sheet]:
    numbers = [q.number for q in paper.questions]
    sheets: list[Sheet] = []
    for name, sheet_file in parsed:
        _check_columns(name, sheet_file, numbers, issues)
        sheets.extend(sheet_file.sheets)
    _check_unmapped_questions(parsed, numbers, issues)
    sheets = _drop_duplicates(sheets, issues)
    _check_headcount(sheets, result, issues)
    _check_answers(paper, sheets, issues)
    return sheets


def _check_columns(name: str, sheet_file: SheetFile, numbers: list[int], issues: Issues) -> None:
    if sheet_file.columns is None:
        return
    missing = [n for n in numbers if n not in sheet_file.columns]
    if missing:
        issues.error(name, "Row 1", f"There is no column for {join_numbers(missing)}. Add "
                     f"columns named {', '.join(f'Q{n}' for n in missing)}.")
    extra = sorted(sheet_file.columns - set(numbers))
    if extra:
        issues.warn(name, "Row 1", f"{join_numbers(extra).capitalize()} is not on the test, so "
                    f"those answers will be ignored.")


def _check_unmapped_questions(parsed: list[tuple[str, SheetFile]], numbers: list[int],
                              issues: Issues) -> None:
    """Text and JSON sheets have no header to check. When several students were read
    from them and none has an answer for a question, the answers are probably not
    in the shape we expect. One student leaving a question out is only a blank."""
    loose = [(name, s) for name, sf in parsed if sf.columns is None for s in sf.sheets]
    if len(loose) < 2:
        return
    answered = {n for _, s in loose for n, v in s.answers.items() if v.strip()}
    for number in [n for n in numbers if n not in answered]:
        issues.error(loose[0][0], "whole file", f"No student has an answer for question {number}. "
                     f"Each answer should start on its own line, like 'Q{number}: ...'.")
    extra = sorted({n for _, s in loose for n in s.answers} - set(numbers))
    if extra:
        issues.warn(loose[0][0], "whole file", f"{join_numbers(extra).capitalize()} is not on the "
                    f"test, so those answers will be ignored.")


def _drop_duplicates(sheets: list[Sheet], issues: Issues) -> list[Sheet]:
    seen: dict[str, Sheet] = {}
    for sheet in sheets:
        key = sheet.ref.strip().lower()
        if key in seen:
            first = seen[key]
            issues.error(sheet.file, sheet.where, f"The student id '{sheet.ref}' is already used "
                         f"in {first.file} ({first.where}). Each student needs their own id.")
        else:
            seen[key] = sheet
    return list(seen.values())


def _check_headcount(sheets: list[Sheet], result: Analysis, issues: Issues) -> None:
    if not sheets:
        if not issues.errors:
            issues.error("Answer sheets", "whole upload", "No students were found.")
        return
    known = store.existing_refs(result.class_id) if result.class_id else {}
    fresh = [s for s in sheets if s.ref.strip().lower() not in known]
    if len(known) + len(fresh) > config.UPLOAD_MAX_STUDENTS:
        issues.error("Answer sheets", "whole upload", f"That would make {len(known) + len(fresh)} "
                     f"students in the class. The most we can take is {config.UPLOAD_MAX_STUDENTS}.")
    if len(sheets) < config.UPLOAD_MIN_STUDENTS:
        issues.warn("Answer sheets", "whole upload", f"Only {len(sheets)} "
                    f"student{'s' if len(sheets) != 1 else ''}. A whole-class pattern needs at "
                    f"least {config.UPLOAD_MIN_STUDENTS}, so you will get findings for individual "
                    f"students only.")


def _check_answers(paper: Paper, sheets: list[Sheet], issues: Issues) -> None:
    """Blank answers and multiple-choice answers that are not one of the options."""
    blanks: list[tuple[Sheet, str]] = []
    unknown: list[tuple[Sheet, str]] = []
    for sheet in sheets:
        empty = [q.number for q in paper.questions if not sheet.answers.get(q.number, "").strip()]
        if empty:
            blanks.append((sheet, f"{sheet.name} left {join_numbers(empty)} blank."))
        for q in paper.questions:
            raw = sheet.answers.get(q.number, "")
            if raw.strip() and not resolve_choice(q, raw)[2]:
                unknown.append((sheet, f"{sheet.name}'s answer to question {q.number} "
                                       f"('{raw.strip()[:30]}') is not one of the options, so "
                                       f"it will be marked wrong."))
    for group, noun in ((blanks, "with blank answers"), (unknown, "with an unrecognised choice")):
        for sheet, message in group[:WARNING_CAP]:
            issues.warn(sheet.file, sheet.where, message)
        if len(group) > WARNING_CAP:
            issues.warn(group[0][0].file, "whole upload",
                        f"{len(group) - WARNING_CAP} more students {noun}.")


# --- summary ------------------------------------------------------------------------

def _summary(result: Analysis) -> dict[str, Any]:
    questions = result.paper.questions if result.paper else []
    labels = {t["id"]: t["label"] for t in mock_api.taxonomy()["topics"]}
    counts: dict[str, int] = {}
    for q in questions:
        if q.topic:
            counts[q.topic] = counts.get(q.topic, 0) + 1
    known = store.existing_refs(result.class_id) if result.class_id else {}
    numbers = [q.number for q in questions]
    return {
        "title": result.title,
        "question_count": len(questions),
        "total_marks": round(sum(q.marks for q in questions), 2),
        "student_count": len(result.sheets),
        "blank_answers": sum(1 for s in result.sheets for n in numbers
                             if not s.answers.get(n, "").strip()),
        "topics": [{"id": t, "label": labels.get(t, t), "count": counts[t]} for t in sorted(counts)],
        "untagged_questions": sum(1 for q in questions if not q.topic),
        "new_students": sum(1 for s in result.sheets if s.ref.strip().lower() not in known),
        "needs_ai": True,
    }
