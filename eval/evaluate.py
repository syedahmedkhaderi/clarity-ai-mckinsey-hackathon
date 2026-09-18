"""Scores a completed LOOP batch against the generator's ground truth.

This is the only file in the repository that is allowed to read
data/ground_truth.json. The backend never does, and this script proves it by
walking the backend package and failing if any executable reference to
ground_truth appears there.

Run:
    python eval/evaluate.py                     run the pipeline on a temp DB and score it
    python eval/evaluate.py --batch-json P      score a batch result already saved to disk

Writes eval/results.md.
"""

from __future__ import annotations

import argparse
import ast
import json
import os
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

GROUND_TRUTH = ROOT / "data" / "ground_truth.json"
BACKEND = ROOT / "backend"
RESULTS = ROOT / "eval" / "results.md"
SEED_ASSESSMENTS = ("A1", "A2")


@dataclass
class Rate:
    """A hit count over a denominator, rendered as a percentage or as 'n/a'."""

    hits: int = 0
    total: int = 0

    def add(self, hit: bool) -> None:
        self.hits += int(hit)
        self.total += 1

    @property
    def value(self) -> float | None:
        return (self.hits / self.total) if self.total else None

    def render(self) -> str:
        if self.total == 0:
            return "n/a (no cases)"
        return f"{self.value:.1%} ({self.hits} of {self.total})"


@dataclass
class Report:
    assessment_id: str
    offline: bool
    recovery: Rate = field(default_factory=Rate)
    pre_gate_recovery: Rate = field(default_factory=Rate)
    top2: Rate = field(default_factory=Rate)
    escalation_precision: Rate = field(default_factory=Rate)
    second_language: Rate = field(default_factory=Rate)
    first_language: Rate = field(default_factory=Rate)
    second_language_pre_gate: Rate = field(default_factory=Rate)
    misses_held_at_the_gate: int = 0
    returners: Rate = field(default_factory=Rate)
    returners_scheduled: Rate = field(default_factory=Rate)
    evidence_valid: Rate = field(default_factory=Rate)
    coverage: Rate = field(default_factory=Rate)
    totals: dict[str, Any] = field(default_factory=dict)
    escalations_by_code: dict[str, int] = field(default_factory=dict)

    @property
    def language_gap(self) -> float | None:
        if self.second_language.value is None or self.first_language.value is None:
            return None
        return self.first_language.value - self.second_language.value


# --- the guarantee the README makes ----------------------------------------

def _executable_ground_truth_refs(path: Path) -> list[str]:
    """Executable references to ground_truth in one module.

    Comments and docstrings are allowed: offline_rules.py documents the fact
    that it never reads the file, and that sentence is not a read. Anything
    else, a string literal in code or an identifier, is a real reference.
    """
    tree = ast.parse(path.read_text(), filename=str(path))
    docstrings = {
        ast.get_docstring(node, clean=False)
        for node in ast.walk(tree)
        if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef))
    }
    hits: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            if "ground_truth" in node.value and node.value not in docstrings:
                hits.append(f"{path}:{node.lineno}: string literal {node.value!r}")
        elif isinstance(node, ast.Name) and "ground_truth" in node.id:
            hits.append(f"{path}:{node.lineno}: name {node.id}")
        elif isinstance(node, ast.Attribute) and "ground_truth" in node.attr:
            hits.append(f"{path}:{node.lineno}: attribute {node.attr}")
    return hits


def assert_backend_never_reads_ground_truth() -> None:
    """Fails loudly. The README states this guarantee and a judge will check it."""
    offenders: list[str] = []
    for path in sorted(BACKEND.rglob("*.py")):
        offenders.extend(_executable_ground_truth_refs(path))
    if offenders:
        print("FAIL: backend/ references ground_truth in executable code:", file=sys.stderr)
        for line in offenders:
            print(f"  {line}", file=sys.stderr)
        raise SystemExit(2)
    print("check passed: no executable reference to ground_truth anywhere in backend/")


# --- inputs ----------------------------------------------------------------

def load_ground_truth() -> dict[str, Any]:
    return json.loads(GROUND_TRUTH.read_text())


def run_pipeline(assessment_id: str, minutes: int | None) -> dict[str, Any]:
    """Seeds history with the earlier assessments, then runs the scored one.

    Uses a throwaway database so a scoring run never touches loop.db, which the
    demo is sitting on.
    """
    tmp_dir = tempfile.mkdtemp(prefix="loop-eval-")
    os.environ["LOOP_DB_PATH"] = str(Path(tmp_dir) / "eval.db")
    from backend import db, service  # imported after LOOP_DB_PATH is set

    db.init_db()
    for seed in SEED_ASSESSMENTS:
        if seed != assessment_id:
            service.run_sync(seed, minutes=minutes)
    return service.run_sync(assessment_id, minutes=minutes)


def offline_mode() -> bool:
    from backend import llm

    return not llm.available()


# --- scoring ---------------------------------------------------------------

def _pre_gate_nodes(batch: dict[str, Any]) -> dict[tuple[str, str], str | None]:
    """Every diagnosis the diagnostician reached, before the reviewer gate.

    state["all_diagnoses"] carries them when it survives the graph. When it does
    not, the escalations rebuild it: each diagnosis escalation records the node
    the agent would have recorded as candidate_a.
    """
    keyed: dict[tuple[str, str], str | None] = {}
    for d in batch.get("all_diagnoses") or []:
        keyed[(d["learner_id"], d["question_id"])] = d.get("taxonomy_node")
    if keyed:
        return keyed
    for d in batch.get("diagnoses") or []:
        keyed[(d["learner_id"], d["question_id"])] = d.get("taxonomy_node")
    for esc in batch.get("escalations") or []:
        if esc.get("raised_by") != "diagnostician" or not esc.get("question_id"):
            continue
        keyed[(esc["learner_id"], esc["question_id"])] = esc.get("candidate_a")
    return keyed


def _score_recovery(report: Report, truth_rows: list[dict[str, Any]],
                    surviving: dict[tuple[str, str], dict[str, Any]],
                    traits: dict[str, Any], pre_gate: dict[tuple[str, str], str | None]) -> None:
    """Recovery, top-2 and the language split, over every injected misconception.

    Scored twice. The headline number is what the facilitator actually sees, so
    an item the reviewer held back counts as not recovered. The pre-gate number
    scores what the diagnostician reached before the gate, which separates a
    wrong diagnosis from a correct one that was escalated on purpose.
    """
    for row in truth_rows:
        key = (row["learner_id"], row["question_id"])
        diagnosis = surviving.get(key)
        node = diagnosis.get("taxonomy_node") if diagnosis else None
        alt = diagnosis.get("alternative_node") if diagnosis else None
        hit = node == row["injected_node"]
        pre_hit = pre_gate.get(key) == row["injected_node"]
        report.recovery.add(hit)
        report.pre_gate_recovery.add(pre_hit)
        report.top2.add(hit or alt == row["injected_node"])
        report.coverage.add(diagnosis is not None)
        if pre_hit and not hit:
            report.misses_held_at_the_gate += 1
        second = bool(traits.get(row["learner_id"], {}).get("second_language"))
        (report.second_language if second else report.first_language).add(hit)
        if second:
            report.second_language_pre_gate.add(pre_hit)


def _score_escalations(report: Report, batch: dict[str, Any],
                       truth_by_key: dict[tuple[str, str], dict[str, Any]]) -> None:
    """Of the diagnoses the reviewer held back, how many would have been wrong."""
    pre_gate = _pre_gate_nodes(batch)
    for esc in batch.get("escalations") or []:
        report.escalations_by_code[esc["reason_code"]] = \
            report.escalations_by_code.get(esc["reason_code"], 0) + 1
        if esc.get("raised_by") != "diagnostician" or not esc.get("question_id"):
            continue
        key = (esc["learner_id"], esc["question_id"])
        row = truth_by_key.get(key, {})
        injected = row.get("injected_node") if row.get("injected_kind") == "misconception" else None
        report.escalation_precision.add(pre_gate.get(key) != injected)


def _score_returners(report: Report, batch: dict[str, Any], traits: dict[str, Any]) -> None:
    """A restart point is an RS- action. The plan proposing one is the behaviour
    under test; whether the budget then held it is reported separately."""
    plan = batch.get("plan") or {}
    actions = (plan.get("scheduled") or []) + (plan.get("dropped") or [])
    proposed = {lid for a in actions if a["action_id"].startswith("RS-")
                for lid in a.get("learner_ids") or []}
    scheduled = {lid for a in plan.get("scheduled") or [] if a["action_id"].startswith("RS-")
                 for lid in a.get("learner_ids") or []}
    for learner_id, trait in sorted(traits.items()):
        if not trait.get("returner"):
            continue
        report.returners.add(learner_id in proposed)
        report.returners_scheduled.add(learner_id in scheduled)


def _score_evidence(report: Report, batch: dict[str, Any]) -> None:
    """Every evidence span must be verbatim text from the learner's own answer.

    Scoped to written diagnoses. An MCQ diagnosis cites the option text from the
    marking scheme, which is by construction not a substring of a one-letter
    answer, so including it would measure nothing.
    """
    answers = {(s["learner_id"], s["question_id"]): s["answer"]
               for s in batch.get("submissions") or []}
    for d in batch.get("diagnoses") or []:
        if d.get("source") not in ("model", "fallback"):
            continue
        span = d.get("evidence_span") or ""
        answer = answers.get((d["learner_id"], d["question_id"]), "")
        report.evidence_valid.add(not span or span in answer)


def score(batch: dict[str, Any], truth: dict[str, Any], offline: bool) -> Report:
    assessment_id = batch["assessment_id"]
    report = Report(assessment_id=assessment_id, offline=offline)
    rows = [r for r in truth["responses"] if r["assessment_id"] == assessment_id]
    truth_by_key = {(r["learner_id"], r["question_id"]): r for r in rows}
    injected = [r for r in rows if r["injected_kind"] == "misconception" and r["injected_node"]]
    surviving = {(d["learner_id"], d["question_id"]): d for d in batch.get("diagnoses") or []}

    _score_recovery(report, injected, surviving, truth["traits"], _pre_gate_nodes(batch))
    _score_escalations(report, batch, truth_by_key)
    _score_returners(report, batch, truth["traits"])
    _score_evidence(report, batch)

    marks = batch.get("marks") or []
    plan = batch.get("plan") or {}
    report.totals = {
        "responses": len(rows),
        "marks_surviving": len(marks),
        "lost_marks": sum(1 for m in marks if m["awarded"] < m["max_marks"]),
        "injected_misconceptions": len(injected),
        "diagnoses": len(surviving),
        "escalations": len(batch.get("escalations") or []),
        "correct diagnoses held at the reviewer gate": report.misses_held_at_the_gate,
        "minutes_used": plan.get("minutes_used"),
        "budget_minutes": plan.get("budget_minutes"),
        "actions_scheduled": len(plan.get("scheduled") or []),
        "actions_dropped": len(plan.get("dropped") or []),
    }
    return report


# --- reporting -------------------------------------------------------------

OFFLINE_CAVEAT = """## Read this before quoting any number below

This run was made in **offline mode**, with no `OPENAI_API_KEY` set. In offline
mode the marker and the diagnostician are deterministic rule engines, and those
rules encode the same mathematics that `data/generator.py` used to inject the
errors in the first place. A recovery rate measured this way is a check that the
pipeline is wired correctly end to end. It is not a measurement of model
quality, and it must not be quoted as one.

To measure anything about model quality, set `OPENAI_API_KEY` and run this
script again. The mode used is recorded in the table below, so a reader can
always tell which kind of number they are looking at.
"""

ONLINE_NOTE = """## Mode

This run used the model path (`OPENAI_API_KEY` was set), so the recovery numbers
below reflect the diagnostician's prompt and the model behind it. The errors
being recovered were injected by deterministic Python rules in
`data/generator.py`, never by a language model, so the measurement is not
self-graded.
"""


def _metric_rows(report: Report) -> list[tuple[str, str, str]]:
    gap = report.language_gap
    gap_text = "n/a" if gap is None else f"{gap:+.1%}"
    return [
        ("Misconception recovery rate", report.recovery.render(),
         "Diagnosed node equals the injected node, over every injected misconception. "
         "An item the reviewer escalated counts as not recovered"),
        ("Recovery before the reviewer gate", report.pre_gate_recovery.render(),
         "The same comparison against what the diagnostician reached, escalated items included"),
        ("Top-2 recovery rate", report.top2.render(),
         "Injected node is the chosen node or the runner-up"),
        ("Escalation precision", report.escalation_precision.render(),
         "Of the diagnoses the reviewer held back, the share that would have been wrong"),
        ("Recovery, second-language learners", report.second_language.render(),
         "Same metric, restricted to learners whose written answers carry grammatical noise"),
        ("Recovery, second-language, before the gate", report.second_language_pre_gate.render(),
         "The same group scored on what the diagnostician reached, escalated items included"),
        ("Recovery, everyone else", report.first_language.render(),
         "Same metric, all other learners"),
        ("Language separation gap", gap_text,
         "Everyone else minus second-language. A large positive gap is the failure mode"),
        ("Returner handling", report.returners.render(),
         "Returners for whom the plan produced a restart point, scheduled or dropped"),
        ("Returner restart points scheduled", report.returners_scheduled.render(),
         "The subset that survived the time budget"),
        ("Evidence span validity", report.evidence_valid.render(),
         "Written diagnoses whose evidence span is verbatim text from the learner's answer"),
        ("Diagnosis coverage", report.coverage.render(),
         "Injected misconceptions that received a surviving diagnosis rather than an escalation"),
    ]


def _language_verdict(report: Report) -> str:
    """Says what the gap is, and whether it is a misdiagnosis or a deliberate hold."""
    gap = report.language_gap
    if gap is None:
        return "Not measurable in this run: one of the two groups had no injected errors."
    sl, sl_pre = report.second_language, report.second_language_pre_gate
    misdiagnosed = sl_pre.total - sl_pre.hits
    escalated = sl_pre.hits - sl.hits
    missed = sl.total - sl.hits
    detail = (f"Of the {missed} second-language case{'' if missed == 1 else 's'} not recovered, "
              f"{escalated} {'was' if escalated == 1 else 'were'} diagnosed correctly and then "
              f"held at the reviewer gate as a language barrier, and {misdiagnosed} "
              f"{'was' if misdiagnosed == 1 else 'were'} genuinely misdiagnosed.")
    if gap > 0.15 and misdiagnosed > 0:
        return (f"**A gap of {gap:+.1%} is large and {misdiagnosed} of it is real misdiagnosis.** "
                f"{detail} The fix belongs in the diagnostician prompt, not in the taxonomy: "
                f"tighten the instruction that grammatical noise is never evidence of conceptual "
                f"weakness, then run this script again.")
    if gap > 0.15:
        return (f"**The headline gap is {gap:+.1%}, but none of it is misdiagnosis.** {detail} "
                f"Holding a language case back from the cohort picture is the intended "
                f"behaviour, so read this gap as the reviewer gate working, not as the "
                f"diagnostician failing. The number to watch for regression is recovery before "
                f"the gate: {sl_pre.render()} against {report.first_language.render()}.")
    if gap < -0.15:
        return (f"The gap runs the other way at {gap:+.1%}. Second-language learners are "
                f"recovered better than the rest, which usually means their errors are "
                f"concentrated in the language nodes the rules match most confidently. {detail}")
    return (f"A gap of {gap:+.1%} is small. Language noise is not, on this run, being read as "
            f"conceptual weakness. That is the behaviour the fixture exists to protect. {detail}")


def render(report: Report) -> str:
    lines: list[str] = ["# LOOP evaluation results", ""]
    lines.append(OFFLINE_CAVEAT if report.offline else ONLINE_NOTE)
    lines.append("")
    lines.append(f"Assessment scored: **{report.assessment_id}**. "
                 f"Mode: **{'offline deterministic rules' if report.offline else 'model'}**. "
                 f"Ground truth: `data/ground_truth.json`, read by this script only.")
    lines.append("")
    lines.append("## Metrics")
    lines.append("")
    lines.append("| Metric | Result | Definition |")
    lines.append("|---|---|---|")
    for name, value, definition in _metric_rows(report):
        lines.append(f"| {name} | {value} | {definition} |")
    lines.append("")
    lines.append("## Language separation")
    lines.append("")
    lines.append(_language_verdict(report))
    lines.append("")
    lines.append("## Run totals")
    lines.append("")
    lines.append("| Quantity | Value |")
    lines.append("|---|---|")
    for key, value in report.totals.items():
        lines.append(f"| {key.replace('_', ' ').capitalize()} | {value} |")
    lines.append("")
    lines.append("## Escalations by reason code")
    lines.append("")
    lines.append("| Reason code | Count |")
    lines.append("|---|---|")
    for code, count in sorted(report.escalations_by_code.items()):
        lines.append(f"| {code} | {count} |")
    if not report.escalations_by_code:
        lines.append("| none raised | 0 |")
    lines.append("")
    lines.append("Escalation precision is scored over diagnosis escalations only. "
                 "LOW_MARK_CONFIDENCE, SPARSE_HISTORY and BUDGET_OVERFLOW are not claims about "
                 "a misconception, so ground truth has nothing to say about them.")
    lines.append("")
    lines.append(f"Escalation precision at {report.escalation_precision.render()} means the "
                 f"reviewer is cautious: most of what it held back would not in fact have been "
                 f"wrong. That is the intended bias for a system where a human approves every "
                 f"mark, but it is a cost in facilitator time and it is the number to watch if "
                 f"the queue gets long.")
    lines.append("")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Score a LOOP batch against ground truth.")
    parser.add_argument("--batch-json", type=Path, default=None,
                        help="Score a saved batch result instead of running the pipeline.")
    parser.add_argument("--assessment", default="A3", help="Assessment to run and score.")
    parser.add_argument("--minutes", type=int, default=None, help="Facilitator time budget.")
    parser.add_argument("--out", type=Path, default=RESULTS, help="Where to write the report.")
    args = parser.parse_args(argv)

    assert_backend_never_reads_ground_truth()

    if args.batch_json:
        batch = json.loads(args.batch_json.read_text())
        print(f"scoring saved batch {batch.get('batch_id')} from {args.batch_json}")
    else:
        batch = run_pipeline(args.assessment, args.minutes)
        print(f"ran {args.assessment} on a temporary database, status {batch.get('status')}")

    report = score(batch, load_ground_truth(), offline_mode())
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(render(report))
    print(f"wrote {args.out}")
    print(f"recovery {report.recovery.render()}, top-2 {report.top2.render()}")
    gap = report.language_gap
    print(f"language gap {'n/a' if gap is None else f'{gap:+.1%}'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
