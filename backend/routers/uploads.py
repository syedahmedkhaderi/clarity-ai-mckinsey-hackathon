"""Teacher uploads of tests, marking schemes and answer sheets.

Routes are added here by the stream that owns this file.
"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/api/uploads", tags=["uploads"])
