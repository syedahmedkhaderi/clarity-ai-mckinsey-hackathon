"""Drafting and sending a note to a student.

Routes are added here by the stream that owns this file.
"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["email"])
