"""The bundled sample test: a fractions paper and eight students.

The answers are hand-written. Five students make the same mistake of adding the
numerators and the denominators separately, and one writes correct mathematics in
a second language, so the sample shows a whole-class pattern and the wording rule
in one run.
"""

from __future__ import annotations

from backend.config import DATA_DIR
from backend.uploads import store
from backend.uploads.analyse import Analysis, analyse

SAMPLE_DIR = DATA_DIR / "samples"
SAMPLE_CLASS = "Sample class"
SAMPLE_TITLE = "Fractions check (sample)"
PAPER_FILE = "fractions_paper.csv"
SHEETS_FILE = "fractions_sheets.csv"


def existing_sample() -> dict[str, str] | None:
    """The sample test if it was already added, so adding it twice is harmless."""
    class_id = store.find_class_by_name(SAMPLE_CLASS)
    aid = store.find_test(class_id, SAMPLE_TITLE) if class_id else None
    if not (class_id and aid):
        return None
    return {"assessment_id": aid, "class_id": class_id, "name": SAMPLE_TITLE}


def analyse_sample() -> Analysis:
    return analyse(
        class_id=None, class_name=SAMPLE_CLASS, title=SAMPLE_TITLE,
        paper_file=(PAPER_FILE, (SAMPLE_DIR / PAPER_FILE).read_text(encoding="utf-8")),
        sheet_files=[(SHEETS_FILE, (SAMPLE_DIR / SHEETS_FILE).read_text(encoding="utf-8"))])
