"""Runtime configuration and the tuning constants the agents reason against.

Every threshold the graph branches on lives here so a reviewer can audit the
decision rules without reading agent code.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Final

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # pragma: no cover - dotenv is optional at runtime
    pass

ROOT: Final[Path] = Path(__file__).resolve().parent.parent
DATA_DIR: Final[Path] = ROOT / "data"
GENERATED_DIR: Final[Path] = DATA_DIR / "generated"

OPENAI_API_KEY: Final[str] = os.getenv("OPENAI_API_KEY", "").strip()
MODEL_FAST: Final[str] = os.getenv("LOOP_MODEL_FAST", "gpt-4o-mini")
MODEL_SMART: Final[str] = os.getenv("LOOP_MODEL_SMART", "gpt-4o")
DB_PATH: Final[Path] = Path(os.getenv("LOOP_DB_PATH", str(ROOT / "loop.db")))

# Offline mode is not a degraded mode that hides failure. It is a deterministic
# rule engine that produces the same shapes as the model path, so the demo runs
# with no API key and no network.
OFFLINE: Final[bool] = not OPENAI_API_KEY

# Reviewer gate thresholds. Each maps to one reason code in agents/reviewer.py.
MARK_CONFIDENCE_FLOOR: Final[float] = 0.60
DIAGNOSIS_CONFIDENCE_FLOOR: Final[float] = 0.65
AMBIGUITY_GAP: Final[float] = 0.15
SPARSE_HISTORY_FLOOR: Final[float] = 0.50
HIGH_SEVERITY_FLOOR: Final[float] = 0.75

# Cohort analysis thresholds.
SHARED_MISCONCEPTION_SHARE: Final[float] = 0.40
RECURRENCE_MIN_ASSESSMENTS: Final[int] = 2
MIN_LEARNERS_FOR_PATTERN: Final[int] = 4

# The planner needs at least this many surviving diagnoses to be worth running.
MIN_DIAGNOSES_TO_PLAN: Final[int] = 2

DEFAULT_FACILITATOR_MINUTES: Final[int] = int(os.getenv("LOOP_FACILITATOR_MINUTES", "120"))

ACTION_COSTS: Final[dict[str, int]] = {
    "group_reteach": 30,
    "peer_pairing": 15,
    "individual_followup": 20,
    "feedback_review": 5,
}

ACTION_LABELS: Final[dict[str, str]] = {
    "group_reteach": "Group re-teach",
    "peer_pairing": "Peer pairing",
    "individual_followup": "Individual follow-up",
    "feedback_review": "Drafted feedback review",
}
