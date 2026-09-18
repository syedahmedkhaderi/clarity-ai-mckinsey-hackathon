"""The chat helper that answers from the uploaded files and the analysis.

Routes are added here by the stream that owns this file.
"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/api/chat", tags=["chat"])
