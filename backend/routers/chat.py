"""The chat helper that answers from the uploaded files and the analysis.

It sits outside the graph, like uploads and email. Retrieval and answering never
raise (see backend/chat/answer.py), so the only error this router returns is a
plain sentence for an empty question.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.chat import answer

router = APIRouter(prefix="/api/chat", tags=["chat"])


class Turn(BaseModel):
    # Loose on purpose: a turn with an odd role is dropped, not a validation error.
    role: str = ""
    content: str = ""


class ChatRequest(BaseModel):
    question: str = ""
    batch_id: str | None = None
    history: list[Turn] = Field(default_factory=list)


@router.post("")
def ask(body: ChatRequest) -> dict[str, Any]:
    if not answer.prepare_question(body.question):
        raise HTTPException(400, detail={"code": "EMPTY_QUESTION", "message": answer.NOTE_EMPTY})
    return answer.respond(body.question, body.batch_id, [t.model_dump() for t in body.history])


@router.get("/suggestions")
def suggestions(batch_id: str | None = None) -> dict[str, list[str]]:
    return {"suggestions": answer.suggestions(batch_id)}
