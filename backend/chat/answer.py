"""Turns a question into a reply: retrieve, then let the model write from what was found.

Nothing here raises. Any failure in retrieval or the model call ends in the
passages reply, which shows the teacher the most relevant notes and says plainly
that the AI helper is not answering.
"""

from __future__ import annotations

import logging
from typing import Any

from pydantic import BaseModel

from backend import config, llm
from backend.chat import corpus
from backend.chat.bm25 import tokenize
from backend.chat.text import Passage
from backend.prompts import chat as prompt

log = logging.getLogger("loop.chat")

NOTE_NO_AI = "The AI helper is not available right now, so here are the most relevant notes from your files."
NOTE_NOTHING = ("I could not find anything about that in your files. "
                "Try a student's name, a test or a topic.")
NOTE_FAILED = "Something went wrong while looking through your files, so I cannot answer that right now."
NOTE_EMPTY = "Type a question first and I will look through your files."
GENERIC_SUGGESTIONS = ["What questions are in my tests?", "Which topics does each test cover?",
                       "What does the marking scheme say for question 1?",
                       "Which students are in my class?"]


class ChatAnswer(BaseModel):
    answer: str
    sources: list[str]


def prepare_question(question: str | None) -> str:
    """Trimmed and cut to the configured length. Empty stays empty."""
    return (question or "").strip()[: config.CHAT_MAX_QUESTION_CHARS].strip()


def _clean_history(history: list[dict[str, Any]] | None) -> list[dict[str, str]]:
    turns = []
    for turn in history or []:
        role, content = turn.get("role"), str(turn.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            turns.append({"role": role, "content": content[: config.CHAT_HISTORY_CHARS]})
    return turns[-config.CHAT_HISTORY_TURNS:]


def _retrieval_query(question: str, history: list[dict[str, str]]) -> str:
    """A short follow-up such as "and why?" is searched together with the question before it."""
    if len(tokenize(question)) >= config.CHAT_MIN_QUERY_TOKENS:
        return question
    earlier = [t["content"] for t in history if t["role"] == "user"]
    return f"{earlier[-1]} {question}" if earlier else question


def _snippet(text: str) -> str:
    if len(text) <= config.CHAT_SNIPPET_CHARS:
        return text
    cut = text[: config.CHAT_SNIPPET_CHARS].rsplit(" ", 1)[0].rstrip(" .,;:")
    return f"{cut}..."


def _source(p: Passage) -> dict[str, str]:
    return {"id": p.id, "title": p.title, "kind": p.kind, "snippet": _snippet(p.text)}


def _reply(mode: str, answer: str | None, note: str | None, sources: list[Passage],
           draft: bool) -> dict[str, Any]:
    return {"mode": mode, "answer": answer, "note": note,
            "sources": [_source(p) for p in sources], "marks_are_draft": draft}


def _passages_reply(hits: list[Passage], note: str | None = None) -> dict[str, Any]:
    note = note or (NOTE_NO_AI if hits else NOTE_NOTHING)
    return _reply("passages", None, note, hits, any(p.draft for p in hits))


def _ai_reply(question: str, hits: list[Passage], history: list[dict[str, str]]) -> dict[str, Any] | None:
    """The model's answer, or None when there is nothing trustworthy to show."""
    result = llm.call(prompt.SYSTEM, prompt.build(question, hits, history), ChatAnswer, smart=False)
    if result is None or not result.answer.strip():
        return None
    by_id = {p.id: p for p in hits}
    # Only ids that were actually retrieved count. A model that cites a passage it
    # was never shown is inventing a source.
    cited = [by_id[i] for i in dict.fromkeys(s.strip() for s in result.sources) if i in by_id]
    return _reply("ai", result.answer.strip(), None, cited, any(p.draft for p in hits))


def respond(question: str | None, batch_id: str | None = None,
            history: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """The reply for one question. Never raises."""
    question = prepare_question(question)
    if not question:
        return _passages_reply([], NOTE_EMPTY)
    turns = _clean_history(history)
    try:
        hits = corpus.build(batch_id).search(_retrieval_query(question, turns))
    except Exception:
        log.exception("chat retrieval failed")
        return _passages_reply([], NOTE_FAILED)
    if not hits:
        return _passages_reply([])
    try:
        return _ai_reply(question, hits, turns) or _passages_reply(hits)
    except Exception:
        log.exception("chat answer failed")
        return _passages_reply(hits)


def suggestions(batch_id: str | None = None) -> list[str]:
    """Starter questions worded from the data, so each one has an answer waiting."""
    generic = list(GENERIC_SUGGESTIONS)
    try:
        facts = corpus.build(batch_id).facts
    except Exception:
        log.exception("chat suggestions failed")
        return generic
    if not facts.analysed:
        return generic
    out = ["Which topic is the class weakest at?"]
    if facts.student_name:
        out.append(f"What is {facts.student_name}'s main weakness?")
    return out + ["Which students need help most?", "What should I re-teach this week?"]
