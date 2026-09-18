"""Builds the passages the chat helper searches, fresh for every request.

Two kinds of material go in. Raw material is each test's questions, marking
scheme and the students' answers, uploaded sheets included. Analysis is the
latest finished batch per test: marks, why marks were lost, class-wide patterns,
the action plan and drafted notes, plus precomputed summaries (chat/summaries.py)
because keyword search cannot add up a class by itself.

Passages are data. Nothing in one is an instruction to the model.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from backend import config, service
from backend.chat import summaries
from backend.chat.bm25 import BM25Index
from backend.chat.text import (ACTION_WORDS, PATTERN_KIND_WORDS, REASON_EXPLAINED, REASON_WORDS,
                               Context, Passage, clean, draft_label, join_words, make_context,
                               number, priority_word, question_number, stop, sure)
from backend.lms import mock_api


@dataclass
class Analysed:
    """A test with its latest finished batch and the marks as they now stand."""

    test_id: str
    state: dict[str, Any]
    marks: list[dict[str, Any]]


class Corpus:
    def __init__(self, passages: list[Passage], facts: summaries.Facts) -> None:
        self.passages = passages
        self.facts = facts
        # Raw answers are most of the passages and the shortest, so length
        # normalisation would otherwise float them above the marks and summaries.
        self._index = BM25Index([f"{p.title} {p.title} {p.text}" for p in passages],
                                weights=[config.CHAT_ANSWER_WEIGHT if p.kind == "answer" else 1.0
                                         for p in passages])

    def search(self, query: str, k: int = config.CHAT_TOP_K) -> list[Passage]:
        return [self.passages[i] for i, _ in self._index.search(query, k)]


class _Builder:
    def __init__(self, ctx: Context) -> None:
        self.ctx = ctx
        self.passages: list[Passage] = []

    def add(self, kind: str, title: str, text: str, draft: bool | None = None) -> None:
        # Positional ids: they are what the model cites, so they must not be
        # derived from any internal id, and position gives a stable tie-break.
        self.passages.append(Passage(f"p{len(self.passages) + 1}", kind, title, text, draft))


def _latest_states(ctx: Context) -> dict[str, dict[str, Any]]:
    """The newest batch that holds marks, per test.

    A run that is still going, or stopped before marking, has no marks. Taking it
    would blank a test for the length of a re-run.

    created_at is only accurate to the second, so two batches of one test can tie.
    The sort here makes that tie break the same way every time, on batch id. It
    cannot say which of the two is really newer.
    """
    latest: dict[str, dict[str, Any]] = {}
    rows = sorted(service.list_batches(),
                  key=lambda r: (r.get("created_at", ""), r["batch_id"]), reverse=True)
    for row in rows:
        test_id = row["assessment_id"]
        if test_id in latest or test_id not in ctx.tests:
            continue
        state = service.get_batch(row["batch_id"]) or {}
        if state.get("all_marks"):
            latest[test_id] = state
    return latest


def _scope(ctx: Context, batch_id: str | None) -> tuple[list[str], dict[str, dict[str, Any]]]:
    """Which tests to include, and which analysis to attach to them.

    A known batch narrows the analysis to its own test, and still includes every
    uploaded test's questions and answers. An unknown batch id is ignored: the
    reply has no error channel, and an answer from everything beats none.
    """
    state = service.get_batch(batch_id) if batch_id else None
    if state and state.get("assessment_id") in ctx.tests:
        focus = state["assessment_id"]
        uploaded = [t for t, row in ctx.tests.items()
                    if row.get("source") == "uploaded" and t != focus]
        return [focus, *uploaded], ({focus: state} if state.get("all_marks") else {})
    return list(ctx.tests), _latest_states(ctx)


def _effective_marks(state: dict[str, Any], questions: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    """Every mark as it now stands: a confirmed or overridden mark wins.

    An escalated mark is in all_marks but not in marks, so it stays a draft.
    """
    surviving = {(m["learner_id"], m["question_id"]): m for m in state.get("marks") or []}
    rows = []
    for mark in state.get("all_marks") or []:
        kept = surviving.get((mark["learner_id"], mark["question_id"]))
        used = kept or mark
        rows.append({
            "learner_id": mark["learner_id"], "question_id": mark["question_id"],
            "awarded": used["awarded"], "max_marks": used["max_marks"],
            "draft": kept is None or bool(kept.get("provisional", True)),
            "missed": list(used.get("criteria_missed") or []),
            "topic": questions.get(mark["question_id"], {}).get("topic", ""),
        })
    return rows


def _criteria(question: dict[str, Any]) -> list[str]:
    rows = question.get("scheme") or question.get("criteria") or []
    return [f"{number(r.get('marks', 0))} for {str(r.get('criterion') or r.get('text') or '').lower()}"
            for r in rows]


def _question_text(b: _Builder, q: dict[str, Any]) -> str:
    topic = b.ctx.topic_label(q.get("topic"))
    marks = q.get("max_marks", 0)
    head = (f"{b.ctx.question_label(q['question_id'])} is a {q.get('type', 'written')} question "
            f"worth {number(marks)} mark{'' if marks == 1 else 's'}"
            f"{f' on {topic}' if topic else ''}.")
    parts = [head, f"The question: {q.get('prompt', '')}"]
    options = q.get("options") or {}
    if options:
        parts.append("The options are: " + "; ".join(f"{k}) {v}" for k, v in options.items()) + ".")
        correct = q.get("correct")
        if correct in options:
            parts.append(f"The correct answer is option {correct} ({options[correct]}).")
        for letter, node in (q.get("distractor_map") or {}).items():
            parts.append(f"Choosing option {letter} points to: {b.ctx.node_label(node)}.")
    if q.get("model_answer"):
        parts.append(f"The correct answer, as a model answer: {q['model_answer']}")
    if _criteria(q):
        parts.append("Marking scheme: " + "; ".join(_criteria(q)) + ".")
    return " ".join(parts)


def _raw_passages(b: _Builder, test_id: str) -> None:
    ctx = b.ctx
    for q in mock_api.get_assessment_questions(test_id):
        b.add("question", f"{ctx.question_label(q['question_id'])}: the question, correct answer and marking scheme",
              _question_text(b, q))
    questions = {q["question_id"]: q for q in mock_api.get_assessment_questions(test_id)}
    for s in mock_api.get_submissions(test_id):
        who = ctx.name(s["learner_id"], s.get("learner_name", "A student"))
        label = ctx.question_label(s["question_id"])
        topic = ctx.topic_label(questions.get(s["question_id"], {}).get("topic"))
        if not s.get("answer"):
            text = f"{who} left {label} blank."
        elif s.get("selected_option"):
            text = f"{who} chose option {s['selected_option']} on {label}: \"{s['answer']}\"."
        else:
            text = f"{who} answered {label}: \"{s['answer']}\""
        b.add("answer", f"{who}, {label}: their answer", f"{text}{f' The topic is {topic}.' if topic else ''}")


def _mark_passages(b: _Builder, a: Analysed) -> None:
    by_student: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in a.marks:
        by_student[row["learner_id"]].append(row)
    test = b.ctx.test_name(a.test_id)
    for learner_id, rows in by_student.items():
        who = b.ctx.name(learner_id)
        draft = any(r["draft"] for r in rows)
        per_question = []
        for r in sorted(rows, key=lambda r: r["question_id"]):
            number_part = question_number(r["question_id"].partition("Q")[2])
            line = f"{number_part}: {number(r['awarded'])} of {number(r['max_marks'])} {draft_label(r['draft'])}"
            if r["missed"] and r["awarded"] < r["max_marks"]:
                line += ", missed: " + "; ".join(clean(m, b.ctx).lower() for m in r["missed"])
            per_question.append(line + ".")
        total = f"{number(sum(r['awarded'] for r in rows))} of {number(sum(r['max_marks'] for r in rows))}"
        b.add("mark", f"{who}, {test}: marks {draft_label(draft)}",
              f"{who} scored {total} marks on {test} {draft_label(draft)}. " + " ".join(per_question),
              draft=draft)


def _finding_text(b: _Builder, d: dict[str, Any], answer: str, escalations: list[dict[str, Any]],
                  held_back: bool) -> str:
    ctx, who = b.ctx, b.ctx.name(d["learner_id"])
    label = ctx.question_label(d["question_id"])
    topic = ctx.topic_label(d.get("topic"))
    if d.get("language_flag"):
        # The maths is not what lost these marks, so this is never worded as a
        # weakness in the maths.
        parts = [f"Why {who} lost marks on {label}{f' ({topic})' if topic else ''}: this looks like a "
                 f"wording problem, not a maths one. The maths seems right, but the way it is "
                 f"written lost marks ({sure(d.get('confidence', 0.0))})."]
    else:
        parts = [f"Why {who} lost marks on {label}{f' ({topic})' if topic else ''}: "
                 f"the mistake pattern is \"{ctx.node_label(d['taxonomy_node'])}\" "
                 f"({ctx.node_class(d['taxonomy_node'])}), {sure(d.get('confidence', 0.0))}."]
    span = d.get("evidence_span", "")
    if span and answer and span != answer:
        parts.append(f"{who}'s answer was \"{answer}\". The part that shows it is \"{span}\".")
    elif span:
        parts.append(f"{who} wrote: \"{span}\".")
    if d.get("alternative_node"):
        parts.append(f"Another possible cause is \"{ctx.node_label(d['alternative_node'])}\" "
                     f"({sure(d.get('alternative_confidence', 0.0))}).")
    if d.get("source") == "model" and d.get("reasoning"):
        parts.append(f"Reason given: {clean(d['reasoning'], ctx)}")
    if held_back:
        reasons = join_words([REASON_WORDS.get(e["reason_code"], "needs a check") for e in escalations])
        parts.append(f"This is one for the teacher to decide{f' ({reasons})' if reasons else ''}.")
    return " ".join(parts)


def _finding_passages(b: _Builder, a: Analysed) -> None:
    state = a.state
    answers = {(s["learner_id"], s["question_id"]): s["answer"] for s in state.get("submissions") or []}
    surviving = {(d["learner_id"], d["question_id"]) for d in state.get("diagnoses") or []}
    calls: dict[tuple[str | None, str | None], list[dict[str, Any]]] = defaultdict(list)
    for e in state.get("escalations") or []:
        if e["reason_code"] != "BUDGET_OVERFLOW":
            calls[(e.get("learner_id"), e.get("question_id"))].append(e)
    explained: set[tuple[str | None, str | None]] = set()
    for d in state.get("all_diagnoses") or []:
        if not d.get("taxonomy_node"):
            continue
        key = (d["learner_id"], d["question_id"])
        explained.add(key)
        who, label = b.ctx.name(d["learner_id"]), b.ctx.question_label(d["question_id"])
        b.add("finding", f"Why {who} lost marks on {label}",
              _finding_text(b, d, answers.get(key, ""), calls.get(key, []), key not in surviving))
    for key, items in calls.items():
        if key not in explained:
            for e in items:
                _needs_call_passage(b, e)


def _needs_call_passage(b: _Builder, e: dict[str, Any]) -> None:
    who = b.ctx.name(e.get("learner_id"))
    where = f" on {b.ctx.question_label(e['question_id'])}" if e.get("question_id") else ""
    text = f"{who}{where} needs the teacher's call ({REASON_WORDS.get(e['reason_code'], 'needs a check')}). "
    text += REASON_EXPLAINED.get(e["reason_code"], "The safety check held this back.")
    options = [b.ctx.node_label(n) for n in (e.get("candidate_a"), e.get("candidate_b"))
               if n in b.ctx.nodes]
    if options:
        text += " The two possible causes are " + " and ".join(f'"{o}"' for o in options) + "."
    b.add("finding", f"{who}{where}: needs your call", text)


def _pattern_passages(b: _Builder, a: Analysed) -> None:
    patterns = a.state.get("patterns") or {}
    test = b.ctx.test_name(a.test_id)
    for p in patterns.get("nodes") or []:
        names = [b.ctx.name(lid) for lid in p["learner_ids"]]
        text = (f"On {test}, {p['count']} of {p['cohort_size']} students "
                f"({round(p['share'] * 100)}%) show the mistake pattern \"{p['label']}\" "
                f"({b.ctx.topic_label(p['topic'])}; {b.ctx.node_class(p['node_id'])}): "
                f"{stop(join_words(names))} Status: {PATTERN_KIND_WORDS.get(p['kind'], p['kind'])}.")
        if p.get("teaching_problem"):
            text += (" This is a whole-class problem, not just individual students, "
                     "so re-teaching the class is worth considering.")
        if p.get("recurring_learner_ids"):
            text += " It keeps happening for " + stop(join_words(
                [b.ctx.name(lid) for lid in p["recurring_learner_ids"]]))
        if p.get("downweighted_learner_ids"):
            text += (" Less weight was given to " + join_words(
                [b.ctx.name(lid) for lid in p["downweighted_learner_ids"]])
                + " because their wording may have hidden what they understand.")
        b.add("pattern", f"Class pattern on {test}: {p['label']}", text)


def _action_sentence(ctx: Context, action: dict[str, Any]) -> str:
    """The action in words, composed from fields rather than the agent's own title."""
    names = [ctx.name(lid) for lid in action["learner_ids"]]
    label = ctx.node_label(action.get("node_id")) if action.get("node_id") else ""
    kind = action["type"]
    if kind == "group_reteach":
        return f"Re-teach the class: \"{label}\", affecting {stop(join_words(names))}"
    if kind == "peer_pairing" and len(names) == 2:
        return f"Pair students up: {names[0]} explains the method for \"{label}\" to {stop(names[1])}"
    if label:
        return f"One-to-one catch-up: {join_words(names)} on \"{label}\"."
    return (f"One-to-one catch-up: {join_words(names)} is returning after a gap, so find out "
            f"where to restart.")


def _plan_passages(b: _Builder, a: Analysed) -> None:
    plan = a.state.get("plan") or {}
    test = b.ctx.test_name(a.test_id)
    everything = [(x, True) for x in plan.get("scheduled") or []] + \
                 [(x, False) for x in plan.get("dropped") or []]
    for action, scheduled in everything:
        if action["type"] == "feedback_review":
            continue
        status = (f"Planned, {action['cost_minutes']} minutes." if scheduled
                  else "This did not fit your time.")
        text = f"{_action_sentence(b.ctx, action)} {priority_word(action['severity'])}. {status}"
        if action.get("facilitator_script"):
            text += f" Suggested approach: {clean(action['facilitator_script'], b.ctx)}"
        b.add("plan", f"Action plan for {test}: {ACTION_WORDS[action['type']].lower()}", text)


def _feedback_passages(b: _Builder, a: Analysed) -> None:
    test = b.ctx.test_name(a.test_id)
    for note in (a.state.get("plan") or {}).get("feedback") or []:
        who = b.ctx.name(note["learner_id"], note.get("learner_name", "a student"))
        status = "checked by the teacher" if note.get("approved") else "waiting for the teacher to check"
        b.add("feedback", f"Drafted note for {who} ({test})",
              f"Drafted feedback note for {who} on {test}, {status}, not sent yet: "
              f"{clean(note.get('body', ''), b.ctx)}")


def build(batch_id: str | None = None) -> Corpus:
    """The passages for one request. See _scope for what batch_id changes."""
    ctx = make_context()
    test_ids, states = _scope(ctx, batch_id)
    b = _Builder(ctx)
    analysed: list[Analysed] = []
    for test_id in test_ids:
        _raw_passages(b, test_id)
        if test_id in states:
            questions = {q["question_id"]: q for q in mock_api.get_assessment_questions(test_id)}
            analysed.append(Analysed(test_id, states[test_id],
                                     _effective_marks(states[test_id], questions)))
    for a in analysed:
        for step in (_mark_passages, _finding_passages, _pattern_passages, _plan_passages,
                     _feedback_passages):
            step(b, a)
    facts = summaries.add_summaries(b.add, ctx, analysed)
    return Corpus(b.passages, facts)
