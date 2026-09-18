"""Precomputed summary passages.

Keyword search cannot answer "which topic is the class weakest at?" because no
single passage says it, so the arithmetic is done here, in code, and written down
as passages. The model then quotes a total rather than trying to add one up.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Callable

from backend import config
from backend.chat.text import Context, clean, draft_label, join_words, number, priority_word

if TYPE_CHECKING:  # corpus imports this module, so the type is only for the checker
    from backend.chat.corpus import Analysed

Add = Callable[..., None]
TOP_LISTED = 5


@dataclass
class Seen:
    tests: list[str] = field(default_factory=list)
    count: int = 0
    confidences: list[float] = field(default_factory=list)
    recurring: bool = False


@dataclass
class Student:
    learner_id: str
    class_id: str
    scores: dict[str, tuple[float, float, bool]] = field(default_factory=dict)
    patterns: dict[str, Seen] = field(default_factory=dict)
    wording: list[str] = field(default_factory=list)
    calls: int = 0
    returner: bool = False

    def lost_share(self) -> float:
        possible = sum(p for _, p, _ in self.scores.values())
        return 1 - sum(a for a, _, _ in self.scores.values()) / possible if possible else 0.0


@dataclass
class Facts:
    """What the suggested questions are built from."""

    analysed: bool = False
    student_name: str | None = None


def _student(students: dict[str, Student], ctx: Context, learner_id: str) -> Student:
    if learner_id not in students:
        students[learner_id] = Student(learner_id, ctx.class_of.get(learner_id, ""))
    return students[learner_id]


def _add_scores(students: dict[str, Student], ctx: Context, a: Analysed) -> None:
    totals: dict[str, list[Any]] = {}
    for row in a.marks:
        t = totals.setdefault(row["learner_id"], [0.0, 0.0, False])
        t[0] += row["awarded"]
        t[1] += row["max_marks"]
        t[2] = t[2] or row["draft"]
    for learner_id, (awarded, possible, draft) in totals.items():
        _student(students, ctx, learner_id).scores[a.test_id] = (awarded, possible, draft)


def _add_findings(students: dict[str, Student], ctx: Context, a: Analysed) -> None:
    for d in a.state.get("diagnoses") or []:
        if not d.get("taxonomy_node") or d.get("language_flag"):
            continue
        seen = _student(students, ctx, d["learner_id"]).patterns.setdefault(d["taxonomy_node"], Seen())
        if a.test_id not in seen.tests:
            seen.tests.append(a.test_id)
        seen.count += 1
        seen.confidences.append(d.get("confidence", 0.0))
    for d in a.state.get("all_diagnoses") or []:
        if d.get("language_flag"):
            _student(students, ctx, d["learner_id"]).wording.append(ctx.question_label(d["question_id"]))
    for p in (a.state.get("patterns") or {}).get("nodes") or []:
        for learner_id in p.get("recurring_learner_ids") or []:
            seen = _student(students, ctx, learner_id).patterns.get(p["node_id"])
            if seen:
                seen.recurring = True


def _add_context(students: dict[str, Student], ctx: Context, a: Analysed) -> None:
    for e in a.state.get("escalations") or []:
        if e.get("learner_id") and e["reason_code"] != "BUDGET_OVERFLOW":
            _student(students, ctx, e["learner_id"]).calls += 1
    for c in a.state.get("learners") or []:
        if c.get("returner"):
            _student(students, ctx, c["learner_id"]).returner = True


def build_students(ctx: Context, analysed: list[Analysed]) -> dict[str, Student]:
    students: dict[str, Student] = {}
    for a in analysed:
        _add_scores(students, ctx, a)
        _add_findings(students, ctx, a)
        _add_context(students, ctx, a)
    for s in students.values():
        for seen in s.patterns.values():
            seen.recurring = seen.recurring or len(seen.tests) >= config.RECURRENCE_MIN_ASSESSMENTS
    return students


def _ranked_patterns(s: Student) -> list[tuple[str, Seen]]:
    def key(item: tuple[str, Seen]) -> tuple[Any, ...]:
        node, seen = item
        return (-len(seen.tests), -seen.count, -sum(seen.confidences) / max(1, len(seen.confidences)), node)
    return sorted(s.patterns.items(), key=key)


def _student_text(ctx: Context, s: Student) -> str:
    who = ctx.name(s.learner_id)
    parts = [f"Summary for {who} ({ctx.class_name(s.class_id)})."]
    if s.scores:
        parts.append("Marks: " + "; ".join(
            f"{ctx.test_name(t)}: {number(a)} of {number(p)} {draft_label(d)}"
            for t, (a, p, d) in sorted(s.scores.items())) + ".")
    ranked = _ranked_patterns(s)
    if ranked:
        node, seen = ranked[0]
        tests = join_words([ctx.test_name(t) for t in seen.tests])
        parts.append(f"Main weakness of {who}: \"{ctx.node_label(node)}\" ({ctx.node_class(node)}), "
                     f"seen on {tests}{'; it keeps happening' if seen.recurring else ''}.")
        if len(ranked) > 1:
            parts.append("Other mistake patterns: " + "; ".join(
                f"\"{ctx.node_label(n)}\" ({join_words([ctx.test_name(t) for t in x.tests])})"
                f"{', keeps happening' if x.recurring else ''}" for n, x in ranked[1:]) + ".")
    else:
        parts.append(f"Main weakness of {who}: no clear mistake pattern in the maths was found.")
    if s.wording:
        parts.append(f"Wording, not maths: on {join_words(s.wording)} the maths looks right but "
                     f"the writing lost marks.")
    if s.calls:
        parts.append(f"{s.calls} item{' needs' if s.calls == 1 else 's need'} the teacher's call.")
    if s.returner:
        parts.append(f"{who} is returning after a gap, so some earlier tests are missing.")
    return " ".join(parts)


def _student_passages(add: Add, ctx: Context, students: dict[str, Student]) -> None:
    for s in sorted(students.values(), key=lambda s: s.learner_id):
        drafts = [d for _, _, d in s.scores.values()]
        add("summary", f"Summary for {ctx.name(s.learner_id)}", _student_text(ctx, s),
            draft=any(drafts) if drafts else None)


def _topic_rows(ctx: Context, analysed: list[Analysed]) -> list[tuple[str, float, float]]:
    """(topic, marks lost, marks available), most lost first. Untagged questions
    are left out because a topic cannot be blamed for them."""
    lost: Counter[str] = Counter()
    possible: Counter[str] = Counter()
    for a in analysed:
        for r in a.marks:
            if r["topic"]:
                possible[r["topic"]] += r["max_marks"]
                lost[r["topic"]] += r["max_marks"] - r["awarded"]
    rows = [(t, lost[t], possible[t]) for t in possible]
    return sorted(rows, key=lambda r: (-r[1], -(r[1] / r[2] if r[2] else 0), ctx.topic_label(r[0])))


def _topic_text(ctx: Context, scope: str, rows: list[tuple[str, float, float]], draft: bool) -> str:
    listed = "; ".join(
        f"{i}. {ctx.topic_label(t)}: {number(lost)} of {number(total)} marks lost "
        f"({round(100 * lost / total) if total else 0}%)" for i, (t, lost, total) in enumerate(rows, 1))
    text = (f"Weakest topics in {scope}, ranked by marks lost, worst first "
            f"{draft_label(draft)}: {listed}. The class is weakest at {ctx.topic_label(rows[0][0])}, "
            f"where the most marks were lost.")
    by_share = max(rows, key=lambda r: (r[1] / r[2] if r[2] else 0, r[1]))
    if by_share[0] != rows[0][0]:
        text += (f" By share of marks lost, the highest is {ctx.topic_label(by_share[0])} "
                 f"({round(100 * by_share[1] / by_share[2])}%).")
    return text


def _topic_passages(add: Add, ctx: Context, analysed: list[Analysed]) -> None:
    def emit(scope: str, group: list[Analysed]) -> None:
        rows = _topic_rows(ctx, group)
        if rows:
            draft = any(r["draft"] for a in group for r in a.marks)
            add("summary", f"Weakest topics in {scope}", _topic_text(ctx, scope, rows, draft), draft=draft)

    for a in analysed:
        emit(ctx.test_name(a.test_id), [a])
    for class_id in sorted({ctx.tests[a.test_id]["class_id"] for a in analysed}):
        emit(ctx.class_name(class_id), [a for a in analysed if ctx.tests[a.test_id]["class_id"] == class_id])


def _help_ranking(ctx: Context, students: list[Student]) -> list[str]:
    def key(s: Student) -> tuple[Any, ...]:
        return (-sum(x.recurring for x in s.patterns.values()), -len(s.patterns),
                -s.lost_share(), ctx.name(s.learner_id))
    lines = []
    for s in sorted(students, key=key):
        if not s.patterns and s.lost_share() <= 0:
            continue
        keeps = sum(x.recurring for x in s.patterns.values())
        lines.append(f"{ctx.name(s.learner_id)} ({len(s.patterns)} mistake pattern"
                     f"{'' if len(s.patterns) == 1 else 's'}, {keeps} that keep happening, "
                     f"{round(100 * s.lost_share())}% of marks lost)")
    return lines[:TOP_LISTED]


def _class_passages(add: Add, ctx: Context, analysed: list[Analysed],
                    students: dict[str, Student]) -> None:
    for class_id in sorted({ctx.tests[a.test_id]["class_id"] for a in analysed}):
        group = [a for a in analysed if ctx.tests[a.test_id]["class_id"] == class_id]
        members = [s for s in students.values() if s.class_id == class_id]
        name = ctx.class_name(class_id)
        averages = []
        for a in group:
            totals = [s.scores[a.test_id] for s in members if a.test_id in s.scores]
            if totals:
                draft = any(d for _, _, d in totals)
                averages.append(f"{ctx.test_name(a.test_id)}: average "
                                f"{sum(t[0] for t in totals) / len(totals):.1f} of {number(totals[0][1])} "
                                f"{draft_label(draft)}")
        add("summary", f"Class summary: {name}",
            f"Class summary for {name}, {len(members)} students with marks. "
            f"{'; '.join(averages)}.", draft=any(r["draft"] for a in group for r in a.marks))
        ranking = _help_ranking(ctx, members)
        if ranking:
            add("summary", f"Students who need help most in {name}",
                f"Students who need help most in {name}, most first, judged by mistake patterns that "
                f"keep happening and then by marks lost: {'; '.join(ranking)}.",
                draft=any(r["draft"] for a in group for r in a.marks))
        _reteach_passage(add, ctx, name, group)


def _reteach_passage(add: Add, ctx: Context, class_name: str, group: list[Analysed]) -> None:
    lines = []
    for a in group:
        test = ctx.test_name(a.test_id)
        plan = a.state.get("plan") or {}
        actions = {x.get("node_id"): x for x in plan.get("scheduled") or [] if x["type"] == "group_reteach"}
        whole = [p for p in (a.state.get("patterns") or {}).get("nodes") or [] if p.get("teaching_problem")]
        for p in whole:
            line = (f"On {test}, re-teach the class \"{p['label']}\": {p['count']} of "
                    f"{p['cohort_size']} students show it.")
            action = actions.get(p["node_id"])
            if action:
                line += f" It is in the action plan, {action['cost_minutes']} minutes, " \
                        f"{priority_word(action['severity'])}."
                if action.get("facilitator_script"):
                    line += f" Suggested approach: {clean(action['facilitator_script'], ctx)}"
            lines.append(line)
        if not whole:
            lines.append(f"On {test}, no mistake pattern is shared widely enough to re-teach the class.")
    add("summary", f"What to re-teach in {class_name}",
        f"What should the teacher re-teach this week in {class_name}? " + " ".join(lines))


def add_summaries(add: Add, ctx: Context, analysed: list[Analysed]) -> Facts:
    """Adds every summary passage and returns what the suggestions need."""
    if not analysed:
        return Facts()
    students = build_students(ctx, analysed)
    _student_passages(add, ctx, students)
    _topic_passages(add, ctx, analysed)
    _class_passages(add, ctx, analysed, students)
    with_findings = [s for s in students.values() if s.patterns]
    best = min(with_findings, key=lambda s: (-sum(x.count for x in s.patterns.values()), s.learner_id),
               default=None)
    return Facts(analysed=True, student_name=ctx.name(best.learner_id) if best else None)
