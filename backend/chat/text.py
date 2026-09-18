"""Plain-language vocabulary and the lookups every passage is written with.

Passages are what the model reads and what the teacher sees as sources, so they
are built from names and labels only. Internal ids (mistake pattern codes, student
ids, question ids) never reach a passage; free text written by an agent goes
through clean() first as a second line of defence.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from backend import config
from backend.lms import mock_api

ERROR_CLASS_WORDS = {
    "conceptual": "misunderstood the idea",
    "procedural": "wrong steps",
    "computational": "arithmetic slip",
    "notational": "wrote it wrongly",
    "language": "wording",
}
PATTERN_KIND_WORDS = {
    "shared": "Whole class",
    "recurring": "Keeps happening",
    "emerging": "New this test",
    "insufficient_data": "Too few students to tell",
}
REASON_WORDS = {
    "LOW_MARK_CONFIDENCE": "hard to read",
    "AMBIGUOUS_DIAGNOSIS": "two possible causes",
    "LANGUAGE_BARRIER": "wording, not maths",
    "SPARSE_HISTORY": "missing earlier tests",
    "COUNTS_TOWARD_RECORD": "would count on the record",
}
REASON_EXPLAINED = {
    "LOW_MARK_CONFIDENCE": "The answer was hard to read, so the mark is uncertain.",
    "AMBIGUOUS_DIAGNOSIS": ("The working does not clearly match one known mistake pattern, "
                            "so it may be a one-off slip."),
    "LANGUAGE_BARRIER": ("The marks lost look like a wording problem, not a maths one. "
                         "The student may understand the maths."),
    "SPARSE_HISTORY": ("Some earlier tests are missing, so the picture of this student's "
                       "history is incomplete."),
    "COUNTS_TOWARD_RECORD": "This would count on the student's record, so the teacher decides.",
}
ACTION_WORDS = {
    "group_reteach": "Re-teach the class",
    "peer_pairing": "Pair students up",
    "individual_followup": "One-to-one catch-up",
    "feedback_review": "Check a feedback note",
}

_NODE_ID = re.compile(r"\bM\d{2}\b")
_LEARNER_ID = re.compile(r"\b(?:L\d{2}|C\d{2}-S\d{2})\b")
_QUESTION_ID = re.compile(r"\b[AU]\d{1,2}Q\d{1,2}\b")
_TEST_ID = re.compile(r"\b[AU]\d{1,2}\b")
_VOCABULARY = (
    (re.compile(r"\blearners\b", re.I), "students"),
    (re.compile(r"\blearner\b", re.I), "student"),
    (re.compile(r"\bfacilitators\b", re.I), "teachers"),
    (re.compile(r"\bfacilitator\b", re.I), "teacher"),
    (re.compile(r"\bmisconceptions\b", re.I), "mistake patterns"),
    (re.compile(r"\bmisconception\b", re.I), "mistake pattern"),
    (re.compile(r"\bcohort\b", re.I), "class"),
)


@dataclass(frozen=True)
class Passage:
    """One retrievable piece of the teacher's data.

    draft is None when the passage states no marks, True when any mark it states
    is still a draft, and False when every mark it states is confirmed. It is
    carried as a field so nothing has to read "(draft)" back out of the text.
    """

    id: str
    kind: str
    title: str
    text: str
    draft: bool | None = None


@dataclass
class Context:
    """Everything needed to turn an id into words."""

    names: dict[str, str] = field(default_factory=dict)
    class_of: dict[str, str] = field(default_factory=dict)
    class_names: dict[str, str] = field(default_factory=dict)
    tests: dict[str, dict[str, Any]] = field(default_factory=dict)
    nodes: dict[str, dict[str, Any]] = field(default_factory=dict)
    topics: dict[str, str] = field(default_factory=dict)

    def name(self, learner_id: str | None, fallback: str = "a student") -> str:
        return self.names.get(learner_id or "", fallback)

    def node_label(self, node_id: str | None) -> str:
        return self.nodes.get(node_id or "", {}).get("label", "a mistake pattern")

    def node_class(self, node_id: str | None) -> str:
        cls = self.nodes.get(node_id or "", {}).get("error_class", "")
        return ERROR_CLASS_WORDS.get(cls, cls)

    def topic_label(self, topic_id: str | None) -> str:
        return self.topics.get(topic_id or "", "")

    def test_name(self, assessment_id: str) -> str:
        return self.tests.get(assessment_id, {}).get("display_name", "a test")

    def class_name(self, class_id: str) -> str:
        return self.class_names.get(class_id, "the class")

    def question_label(self, question_id: str) -> str:
        """'Test 3, Question 4' from an id like A3Q4 or U01Q04."""
        test_id, _, number = question_id.partition("Q")
        return f"{self.test_name(test_id)}, {question_number(number)}"


def question_number(digits: str) -> str:
    return f"Question {int(digits)}" if digits.isdigit() else "a question"


def make_context() -> Context:
    """Reads the roster, tests and taxonomy through the LMS connector."""
    ctx = Context()
    taxonomy = mock_api.taxonomy()
    ctx.nodes = {n["id"]: n for n in taxonomy["nodes"]}
    ctx.topics = {t["id"]: t["label"] for t in taxonomy["topics"]}
    for course in mock_api.get_courses():
        ctx.class_names[course["id"]] = course["name"]
        for assignment in mock_api.get_assignments(course["id"]):
            ctx.tests[assignment["id"]] = assignment
        for learner in mock_api.get_roster(course["id"]):
            ctx.names.setdefault(learner["learner_id"], learner["name"])
            ctx.class_of.setdefault(learner["learner_id"], course["id"])
    _separate_shared_names(ctx)
    return ctx


def _separate_shared_names(ctx: Context) -> None:
    """Two students with one name in different classes would merge in a passage."""
    seen: dict[str, int] = {}
    for name in ctx.names.values():
        seen[name] = seen.get(name, 0) + 1
    for learner_id, name in list(ctx.names.items()):
        if seen[name] > 1:
            ctx.names[learner_id] = f"{name} ({ctx.class_name(ctx.class_of.get(learner_id, ''))})"


def clean(text: str, ctx: Context) -> str:
    """Replaces ids and developer words in text an agent wrote.

    Used for reasoning, justifications and drafted notes. It is not applied to a
    student's own answer, which must stay verbatim.
    """
    text = _QUESTION_ID.sub(lambda m: ctx.question_label(m.group(0)), text)
    text = _NODE_ID.sub(lambda m: f'"{ctx.node_label(m.group(0))}"', text)
    text = _LEARNER_ID.sub(lambda m: ctx.name(m.group(0)), text)
    text = _TEST_ID.sub(lambda m: ctx.test_name(m.group(0)), text)
    for pattern, replacement in _VOCABULARY:
        text = pattern.sub(lambda m, r=replacement: r.capitalize() if m.group(0)[0].isupper() else r,
                           text)
    return text


def number(value: float) -> str:
    return str(int(value)) if float(value).is_integer() else f"{value:.1f}"


def sure(confidence: float) -> str:
    return f"{round(confidence * 100)}% sure"


def draft_label(draft: bool) -> str:
    return "(draft)" if draft else "(confirmed)"


def join_words(items: list[str]) -> str:
    if len(items) <= 1:
        return "".join(items)
    return f"{', '.join(items[:-1])} and {items[-1]}"


def priority_word(severity: float) -> str:
    if severity >= config.HIGH_SEVERITY_FLOOR:
        return "High priority"
    if severity >= config.HIGH_SEVERITY_FLOOR - config.CHAT_MEDIUM_SEVERITY_STEP:
        return "Medium priority"
    return "Low priority"


def stop(text: str) -> str:
    """Ends a sentence without doubling the full stop of a name such as "Amira K."."""
    return text if text.endswith((".", "?", "!")) else f"{text}."
