"""Student contacts for the demo class.

The names come from the same roster the marking uses, so an email is always
addressed to the student the analysis is about. Demo addresses sit on the
reserved example.com domain, which cannot deliver, so running the demo can never
email a real person. Teachers can edit an address; the seed never overwrites it.
"""

from __future__ import annotations

import json
from pathlib import Path

from backend import db
from backend.config import DATA_DIR

CONTACTS_PATH = DATA_DIR / "contacts.json"
DEMO_ORIGIN = "demo"


def load_contacts() -> tuple[str, list[dict[str, str]]]:
    """Returns the demo class id and its contacts from data/contacts.json."""
    payload = json.loads(CONTACTS_PATH.read_text())
    return payload["class_id"], payload["students"]


def seed_demo_students(path: Path | None = None) -> int:
    """Inserts the demo students that are missing and returns how many were added.

    INSERT OR IGNORE, so a teacher's edited email survives a restart and a
    re-seed. Only rows that do not exist yet are written.
    """
    class_id, contacts = load_contacts()
    rows = [(c["learner_id"], class_id, c["learner_id"], c["name"], c["email"], DEMO_ORIGIN)
            for c in contacts]
    with db.connect(path) as conn:
        before = conn.total_changes
        conn.executemany(
            "INSERT OR IGNORE INTO students (learner_id, class_id, ref, name, email, origin) "
            "VALUES (?,?,?,?,?,?)", rows)
        return conn.total_changes - before
