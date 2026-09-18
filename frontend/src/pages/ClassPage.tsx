import { useState } from "react";
import { DiagnosisDetail } from "../components/DiagnosisDetail";
import { ClassHeatmap } from "../components/charts/ClassHeatmap";
import { useSession } from "../hooks/useSession";
import { pct } from "../lib/format";
import type { BatchResult } from "../types";

/** Rendered only once a run exists; the app shows the "run first" notice otherwise. */
export function ClassPage() {
  const { batch } = useSession();
  return batch ? <ClassView batch={batch} /> : null;
}

function ClassView({ batch }: { batch: BatchResult }) {
  const s = useSession();
  const [cell, setCell] = useState<{ node: string; learner: string } | null>(null);
  const patterns = batch.patterns;
  if (!patterns) {
    return <p className="text-sm text-ink-muted">There is no class picture for this analysis.</p>;
  }

  const wholeClass = patterns.nodes.filter((n) => n.teaching_problem);
  const nodeMeta = (id: string) => s.taxonomy?.nodes.find((n) => n.id === id);
  const selected = cell
    ? batch.diagnoses.filter(
        (d) => d.taxonomy_node === cell.node && d.learner_id === cell.learner,
      )
    : [];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold text-ink">Class</h1>
        <p className="text-sm text-ink-muted mt-0.5">
          {patterns.cohort_size} students took {s.testName(patterns.assessment_id)}. This page
          shows whether a mistake belongs to one student or to the whole class.
        </p>
      </header>

      {wholeClass.length > 0 && (
        <div className="panel border-agent-line">
          <div className="panel-head bg-agent-soft border-agent-line">
            <div className="panel-title text-agent">
              {wholeClass.length === 1
                ? "One whole-class problem"
                : `${wholeClass.length} whole-class problems`}
            </div>
          </div>
          <ul className="divide-y divide-line">
            {wholeClass.map((n) => (
              <li key={n.node_id} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-medium text-ink">{n.label}</span>
                  <span className="num text-ink-muted ml-auto">
                    {n.count} of {n.cohort_size} students, {pct(n.share)}
                  </span>
                </div>
                <p className="text-xs text-ink-muted mt-1">
                  When {pct(s.sharedThreshold)} or more of the class make the same mistake, it is one
                  gap in the teaching, not {n.count} separate student problems. Students:{" "}
                  {n.learner_ids.map(s.learnerName).join(", ")}.
                </p>
                {nodeMeta(n.node_id) && (
                  <p className="text-xs text-ink-faint mt-1">
                    Next step: {nodeMeta(n.node_id)!.remediation_hint}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <div>
            <div className="panel-title">Who made which mistake</div>
            <div className="panel-sub">
              Select a filled square to see why the marks were lost.
            </div>
          </div>
        </div>
        <div className="p-4">
          <ClassHeatmap
            patterns={patterns}
            learners={batch.learners}
            threshold={s.sharedThreshold}
            onCell={(learner, node) => setCell({ node, learner })}
          />
        </div>
      </div>

      {patterns.notes.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Patterns the system would not call</div>
              <div className="panel-sub">
                Too few students answered on the topic to say anything reliable.
              </div>
            </div>
          </div>
          <ul className="px-4 py-3 space-y-1">
            {patterns.notes.map((n, i) => (
              <li key={i} className="text-xs text-ink-muted">
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}

      {selected.length > 0 && cell && (
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">
              {s.learnerName(cell.learner)}: {s.patternName(cell.node)}
            </div>
            <button className="btn btn-xs" onClick={() => setCell(null)}>
              Close
            </button>
          </div>
          <div className="p-4 space-y-3">
            {selected.map((d) => (
              <DiagnosisDetail
                key={d.question_id}
                diagnosis={d}
                question={s.questions.find((q) => q.question_id === d.question_id)}
                answer={
                  batch.submissions.find(
                    (x) => x.learner_id === d.learner_id && x.question_id === d.question_id,
                  )?.answer ?? ""
                }
                node={nodeMeta(d.taxonomy_node ?? "")}
                alternative={nodeMeta(d.alternative_node ?? "")}
                onOverride={() => s.overrideDiagnosis(d.learner_id, d.question_id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
