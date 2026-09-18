"""Shared test setup.

backend.config reads LOOP_DB_PATH once, at import time, and freezes it. So the
environment variable is set here at module scope, before pytest has collected
anything that could import the backend. Every test in this suite therefore runs
against a throwaway database and never touches loop.db.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path
from typing import Any, Iterator

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

_TMP_DB_DIR = tempfile.mkdtemp(prefix="loop-tests-")
os.environ.setdefault("LOOP_TEST_DB_DIR", _TMP_DB_DIR)
os.environ["LOOP_DB_PATH"] = str(Path(_TMP_DB_DIR) / "loop-tests.db")

import pytest  # noqa: E402

SEEDED = ("A1", "A2")
SCORED = "A3"


def _import_backend() -> tuple[Any, Any]:
    from backend import db, service

    return db, service


@pytest.fixture(scope="session")
def db_path() -> Path:
    return Path(os.environ["LOOP_DB_PATH"])


@pytest.fixture(scope="session")
def pipeline(db_path: Path) -> dict[str, Any]:
    """One run of the demo scenario, shared by every test that needs a result.

    A1 and A2 are run first so the learner history the cohort analyst reads is
    real rather than empty, then A3 is the batch under test.
    """
    db, service = _import_backend()
    db.init_db()
    for assessment_id in SEEDED:
        service.run_sync(assessment_id)
    return service.run_sync(SCORED)


@pytest.fixture(scope="session")
def answers(pipeline: dict[str, Any]) -> dict[tuple[str, str], str]:
    """The learner's own answer text, keyed by learner and question."""
    return {(s["learner_id"], s["question_id"]): s["answer"] for s in pipeline["submissions"]}


@pytest.fixture()
def fresh_a3() -> Iterator[dict[str, Any]]:
    """A re-run of A3 that resets the persisted batch before the test touches it.

    The override tests mutate the stored batch. Re-running first makes each of
    them independent of the order pytest happens to choose.
    """
    db, service = _import_backend()
    db.init_db()
    for assessment_id in SEEDED:
        service.run_sync(assessment_id)
    yield service.run_sync(SCORED)


@pytest.fixture(scope="session")
def ground_truth() -> dict[str, Any]:
    """Read here and nowhere else in the suite, mirroring the backend guarantee."""
    import json

    return json.loads((ROOT / "data" / "ground_truth.json").read_text())
