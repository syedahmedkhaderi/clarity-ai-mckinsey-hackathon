"""Regenerates frontend/src/fixtures from a real backend run.

The frontend builds against these files, and they are produced by the pipeline
rather than hand-written, so the fixture cannot drift away from the real schema.

Run:  python scripts/build_fixture.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend import config, db, service  # noqa: E402
from backend.lms import mock_api  # noqa: E402

FIXTURES = ROOT / "frontend" / "src" / "fixtures"


def main() -> None:
    db_path = config.DB_PATH
    if db_path.exists():
        db_path.unlink()
    db.init_db()
    for assessment_id in ["A1", "A2"]:
        service.run_sync(assessment_id)
    result = service.run_sync("A3")

    FIXTURES.mkdir(parents=True, exist_ok=True)
    _write("batch_result.json", result)
    _write("lms_courses.json", {
        "courses": mock_api.get_courses(),
        "assignments": mock_api.get_assignments("C1"),
    })
    _write("taxonomy.json", mock_api.taxonomy())
    _write("questions.json", {a["assessment_id"]: a["questions"]
                              for a in mock_api.schemes()["assessments"]})
    profiles = {l["learner_id"]: db.full_profile(l["learner_id"])
                for l in mock_api.get_roster("C1")}
    _write("learner_profiles.json", profiles)
    print(f"fixtures written to {FIXTURES}")


def _write(name: str, payload: object) -> None:
    (FIXTURES / name).write_text(json.dumps(payload, indent=2) + "\n")
    print(f"  {name}  {(FIXTURES / name).stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
