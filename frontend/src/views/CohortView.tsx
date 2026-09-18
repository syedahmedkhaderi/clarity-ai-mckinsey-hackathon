import { useState } from "react";
import type { BatchResult, Taxonomy } from "../types";
import { CohortHeatmap } from "../components/CohortHeatmap";
import { DiagnosisDetail } from "../components/DiagnosisDetail";
import type { Question } from "../types";

export function CohortView({
  batch,
  taxonomy,
  questions,
  threshold,
  onOverrideDiagnosis,
}: {
  batch: BatchResult;
  taxonomy: Taxonomy | null;
  questions: Question[];
  threshold: number;
  onOverrideDiagnosis: (learnerId: string, questionId: string) => void;
}) {
  const [cell, setCell] = useState<{ node: string; learner: string } | null>(null);
  const patterns = batch.patterns;
  if (!patterns) {
    return <p className="text-sm text-ink-muted">No cohort analysis in this run.</p>;
  }

  const teaching = patterns.nodes.filter((n) => n.teaching_problem);
  const nodeMeta = (id: string) => taxonomy?.nodes.find((n) => n.id === id);
  const selected = cell
    ? batch.diagnoses.filter(
        (d) => d.taxonomy_node === cell.node && d.learner_id === cell.learner,
      )
    : [];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold text-ink">Cohort pattern</h1>
        <p className="text-sm text-ink-muted mt-0.5">
          {patterns.cohort_size} learners on {patterns.assessment_id}. The question this view
          answers is whether an error is one learner's problem or the whole room's.
        </p>
      </header>

      {teaching.length > 0 && (
        <div className="panel border-agent-line">
          <div className="panel-head bg-agent-soft border-agent-line">
            <div className="panel-title text-agent">
              {teaching.length === 1 ? "One teaching problem" : `${teaching.length} teaching problems`}
            </div>
          </div>
          <ul className="divide-y divide-line">
            {teaching.map((n) => (
              <li key={n.node_id} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="num text-agent font-semibold">{n.node_id}</span>
                  <span className="text-sm font-medium text-ink">{n.label}</span>
                  <span className="num text-ink-muted ml-auto">
                    {n.count} of {n.cohort_size}, {Math.round(n.share * 100)} percent
                  </span>
                </div>
                <p className="text-xs text-ink-muted mt-1">
                  At or above the {Math.round(threshold * 100)} percent threshold this is one gap
                  in teaching, not {n.count} separate learner problems. Learners:{" "}
                  {n.learner_ids.join(", ")}.
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
            <div className="panel-title">Misconception heatmap</div>
            <div className="panel-sub">Click a filled cell to read the underlying diagnosis.</div>
          </div>
        </div>
        <div className="p-4">
          <CohortHeatmap
            patterns={patterns}
            learners={batch.learners}
            threshold={threshold}
            onCell={(node, learner) => setCell({ node, learner })}
          />
        </div>
      </div>

      {patterns.notes.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Patterns the agent refused to call</div>
              <div className="panel-sub">
                Too few learners have data on the topic to support a claim.
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

      {selected.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">
              {cell?.learner} on {cell?.node}
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
                question={questions.find((q) => q.question_id === d.question_id)}
                answer={
                  batch.submissions.find(
                    (s) => s.learner_id === d.learner_id && s.question_id === d.question_id,
                  )?.answer ?? ""
                }
                node={nodeMeta(d.taxonomy_node ?? "")}
                alternative={nodeMeta(d.alternative_node ?? "")}
                onOverride={() => onOverrideDiagnosis(d.learner_id, d.question_id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
