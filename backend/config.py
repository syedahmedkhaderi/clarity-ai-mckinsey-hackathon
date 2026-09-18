"""Runtime configuration and the tuning constants the agents reason against.

Every threshold the graph branches on lives here so a reviewer can audit the
decision rules without reading agent code.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Final

ROOT: Final[Path] = Path(__file__).resolve().parent.parent

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # pragma: no cover - dotenv is optional at runtime
    pass


def _fill_blanks_from(path: Path) -> None:
    """Fills only the variables that are currently missing or blank.

    A QuantumBlack gateway checkout sitting next to the project keeps its own
    credentials, so they are read from there rather than copied around. A blank
    line in the project's own .env counts as unset, otherwise the placeholders
    in .env.example would mask the real values.
    """
    if not path.is_file():
        return
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip().strip("\"'")
        if value and not os.environ.get(key, "").strip():
            os.environ[key] = value


_fill_blanks_from(ROOT / "qb_gateway" / ".env")

DATA_DIR: Final[Path] = ROOT / "data"
GENERATED_DIR: Final[Path] = DATA_DIR / "generated"

def _env(name: str, fallback: str = "") -> str:
    """Reads an environment variable, treating a blank value as unset.

    .env.example ships every key with an empty value so the file documents
    itself. Without this, os.getenv would return that empty string and mask the
    real default, which is a silent failure that looks like a network error.
    """
    return os.getenv(name, "").strip() or fallback


OPENAI_API_KEY: Final[str] = _env("OPENAI_API_KEY")

# --- Azure gateway (QuantumBlack) -------------------------------------------
# The gateway wants clientID:clientSecret as the api key. A plain Azure key also
# works, so both are accepted.
_QB_ID: Final[str] = _env("QB_CLIENT_ID")
_QB_SECRET: Final[str] = _env("QB_CLIENT_SECRET")
_AZURE_KEY: Final[str] = _env("AZURE_OPENAI_API_KEY")

AZURE_CREDENTIAL: Final[str] = (
    f"{_QB_ID}:{_QB_SECRET}" if _QB_ID and _QB_SECRET else _AZURE_KEY
)
AZURE_INSTANCE_ID: Final[str] = _env(
    "LOOP_AZURE_INSTANCE_ID", "c14bbe16-d124-4f7f-a7fd-aba42ee3865e")
AZURE_ENDPOINT: Final[str] = _env(
    "LOOP_AZURE_ENDPOINT",
    f"https://azure.prod.ai-gateway.quantumblack.com/{AZURE_INSTANCE_ID}/")
AZURE_API_VERSION: Final[str] = _env("LOOP_AZURE_API_VERSION", "2024-04-01-preview")

# "azure" when gateway credentials are present, "openai" for a plain key,
# "offline" for neither. Nothing else in the codebase branches on the provider;
# backend/llm.py is the only module that reads it.
# LOOP_OFFLINE=1 forces the deterministic path even when credentials are present.
# The test suite sets it: tests verify wiring and invariants, and they must be
# fast, free and repeatable. eval/evaluate.py is what exercises the model.
_FORCE_OFFLINE: Final[bool] = _env("LOOP_OFFLINE", "0").lower() in ("1", "true", "yes")

PROVIDER: Final[str] = (
    "offline" if _FORCE_OFFLINE
    else "azure" if AZURE_CREDENTIAL
    else "openai" if OPENAI_API_KEY
    else "offline"
)

# Marking is mechanical: check a response against criteria that are already
# written down. Diagnosis and planning are the judgement calls, so they get the
# stronger model. Both are overridable per deployment.
# Measured on the gateway against this project's real prompts, not guessed:
# gpt-4.1-mini returns a batched marking call in about 7s where gpt-4o-mini takes
# 14s, and diagnoses in under 3s. A facilitator waiting on a progress bar is the
# constraint that decides this, so the fast pair is the default and gpt-5.4 is
# one environment variable away for a quality run.
MODEL_FAST: Final[str] = _env(
    "LOOP_MODEL_FAST", "gpt-4.1-mini" if PROVIDER == "azure" else "gpt-4o-mini")
MODEL_SMART: Final[str] = _env(
    "LOOP_MODEL_SMART", "gpt-4.1-mini" if PROVIDER == "azure" else "gpt-4o")

DB_PATH: Final[Path] = Path(_env("LOOP_DB_PATH", str(ROOT / "loop.db")))

# Offline mode is not a degraded mode that hides failure. It is a deterministic
# rule engine that produces the same shapes as the model path, so the demo runs
# with no API key and no network.
OFFLINE: Final[bool] = PROVIDER == "offline"

# Model calls are independent of one another, so they are fanned out. A live
# demo that marks a whole cohort serially at three seconds a call is not a demo.
LLM_CONCURRENCY: Final[int] = int(_env("LOOP_LLM_CONCURRENCY", "16"))

# Learners per marking call. One call per question with the whole cohort in it
# makes a very long response, and output length is what model latency is made of.
# Small chunks in parallel land far sooner than one big one.
MARK_BATCH_SIZE: Final[int] = int(_env("LOOP_MARK_BATCH_SIZE", "4"))

# Planning proposes and scores candidate actions, which code then fits to the
# budget. The judgement that matters most is the diagnosis, so that keeps the
# stronger model and planning takes the faster one. Set LOOP_PLANNER_SMART=1 to
# trade about ten seconds for a richer set of proposals.
PLANNER_SMART: Final[bool] = _env("LOOP_PLANNER_SMART", "0").lower() in ("1", "true", "yes")
LLM_TIMEOUT_SECONDS: Final[int] = int(_env("LOOP_LLM_TIMEOUT", "90"))

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

DEFAULT_FACILITATOR_MINUTES: Final[int] = int(_env("LOOP_FACILITATOR_MINUTES", "120"))

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
