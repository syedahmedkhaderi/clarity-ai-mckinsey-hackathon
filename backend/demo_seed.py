"""Pre-loads a finished analysis so the app is never empty on first open.

A facilitator opening LOOP for the first time, or a judge opening it cold,
should see a worked example immediately rather than an empty shell and a button.
This runs assessments A1 and A2 to build the learner history that makes
recurrence visible, then A3 to leave a complete batch on screen.

Two deliberate choices:

- It always uses the deterministic rules, even when a model provider is
  configured. Seeding must be instant, free and identical on every machine. The
  Run button is what exercises the model.
- It is idempotent. If a batch already exists the function does nothing, so a
  restart never overwrites the run someone is looking at.
"""

from __future__ import annotations

import logging
import threading

from backend import config, db

log = logging.getLogger("loop.seed")

SEEDED_HISTORY = ("A1", "A2")
SEEDED_BATCH = "A3"

_lock = threading.Lock()


def already_seeded() -> bool:
    try:
        return any(b.get("status") == "complete" for b in db.list_batches())
    except Exception:
        return False


def seed(force: bool = False) -> str | None:
    """Builds the demo history and one finished batch. Returns its batch id."""
    from backend import llm, service

    with _lock:
        if not force and already_seeded():
            return None

        # Force the rule engine for the duration of the seed. The provider may be
        # slow, rate limited or absent, and none of that should decide whether
        # the app opens with something to look at.
        previous = config.OFFLINE
        config.OFFLINE = True
        llm.breaker.reset()
        try:
            for assessment_id in SEEDED_HISTORY:
                service.run_sync(assessment_id)
            result = service.run_sync(SEEDED_BATCH)
            batch_id = result["batch_id"]
            log.info("seeded demo batch %s", batch_id)
            return batch_id
        except Exception as exc:  # seeding is a convenience, never a hard failure
            log.warning("demo seeding failed, the app will start empty: %s", exc)
            return None
        finally:
            config.OFFLINE = previous
