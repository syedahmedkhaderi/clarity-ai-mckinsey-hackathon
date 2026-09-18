import { useMemo, useState } from "react";
import type { BatchResult, Question, Taxonomy } from "../types";
import { LearnerCard } from "../components/LearnerCard";
import { DiagnosisDetail } from "../components/DiagnosisDetail";
import { pct } from "../lib/format";

interface ProfileEntry {
  learner_id: string;
  assessment_id: string;
  question_id: string;
  taxonomy_node: string;
  error_class: string;
  confidence: number;
  evidence_span: string;
  reasoning: string;
  language_flag: number;
}

export function LearnerView({
  batch,
  taxonomy,
  questions,
  profiles,
  onOverrideDiagnosis,
}: {
  batch: BatchResult;
  taxonomy: Taxonomy | null;
  questions: Question[];
  profiles: Record<string, ProfileEntry[]>;
  onOverrideDiagnosis: (learnerId: string, questionId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(batch.learners[0]?.learner_id ?? "");
  const learner = batch.learners.find((l) => l.learner_id === selectedId);
  const nodeMeta = (id: string) => taxonomy?.nodes.find((n) => n.id === id);

  const counts = useMemo(() => {
    const map: Record<string, { errors: number; recurring: number }> = {};
    for (const l of batch.learners) {
      const entries = profiles[l.learner_id] ?? [];
      const here = batch.diagnoses.filter((d) => d.learner_id === l.learner_id);
      const seen: Record<string, number> = {};
      for (const e of entries) seen[e.taxonomy_node] = (seen[e.taxonomy_node] ?? 0) + 1;
      map[l.learner_id] = {
        errors: here.length,
        recurring: Object.values(seen).filter((c) => c > 1).length,
      };
    }
    return map;
  }, [batch, profiles]);

  if (!learner) return <p className="text-sm text-ink-muted">No learners in this run.</p>;

  const history = profiles[learner.learner_id] ?? [];
  const byAssessment = history.reduce<Record<string, ProfileEntry[]>>((acc, e) => {
    (acc[e.assessment_id] ||= []).push(e);
    return acc;
  }, {});
  const nodeFrequency = history.reduce<Record<string, string[]>>((acc, e) => {
    (acc[e.taxonomy_node] ||= []).push(e.assessment_id);
    return acc;
  }, {});
  const current = batch.diagnoses.filter((d) => d.learner_id === learner.learner_id);
  const escalated = batch.escalations.filter((e) => e.learner_id === learner.learner_id);

  return (
    <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="panel h-fit sticky top-6">
        <div className="panel-head">
          <div className="panel-title">Learners</div>
          <span className="panel-sub">{batch.learners.length}</span>
        </div>
        <div className="py-1 max-h-[70vh] overflow-y-auto">
          {batch.learners.map((l) => (
            <LearnerCard
              key={l.learner_id}
              learner={l}
              errorCount={counts[l.learner_id]?.errors ?? 0}
              recurringCount={counts[l.learner_id]?.recurring ?? 0}
              selected={l.learner_id === selectedId}
              onClick={() => setSelectedId(l.learner_id)}
            />
          ))}
        </div>
      </aside>

      <div className="space-y-5 min-w-0">
        <header>
          <h1 className="text-lg font-semibold text-ink">{learner.learner_name}</h1>
          <p className="text-sm text-ink-muted mt-0.5">
            {learner.assessments_present.length} of {learner.assessments_expected.length}{" "}
            assessments on record.
            {learner.returner && ` ${learner.note}`}
          </p>
        </header>

        {learner.returner && (
          <div className="panel border-flag-line">
            <div className="px-4 py-3 flex items-center gap-4">
              <div>
                <div className="text-2xs uppercase tracking-wide text-ink-faint">
                  History completeness
                </div>
                <div className="num text-lg text-ink">{pct(learner.history_completeness)}</div>
              </div>
              <div className="flex-1">
                <div className="flex gap-1 mb-1.5">
                  {learner.assessments_expected.map((a) => (
                    <span
                      key={a}
                      className={
                        learner.assessments_present.includes(a)
                          ? "flex-1 h-1.5 rounded-full bg-agent"
                          : "flex-1 h-1.5 rounded-full bg-line-strong"
                      }
                      title={learner.assessments_present.includes(a) ? `${a} present` : `${a} missing`}
                    />
                  ))}
                </div>
                <p className="text-xs text-ink-muted">
                  {learner.low_confidence_history
                    ? "Below half the expected record. Recurrence claims for this learner are downweighted and sent for confirmation."
                    : "Gaps in the record are accounted for. This learner was never dropped from the batch."}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Error profile across assessments</div>
              <div className="panel-sub">
                This is what a score sheet cannot tell you: whether it is the same mistake again.
              </div>
            </div>
          </div>
          {Object.keys(nodeFrequency).length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-muted">
              No diagnosed errors on record for this learner.
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th className="w-16">Node</th>
                  <th>Misconception</th>
                  <th className="w-40">Seen in</th>
                  <th className="w-24">Status</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(nodeFrequency)
                  .sort((a, b) => b[1].length - a[1].length)
                  .map(([node, assessments]) => (
                    <tr key={node}>
                      <td className="num text-ink-muted">{node}</td>
                      <td className="text-sm">{nodeMeta(node)?.label ?? node}</td>
                      <td className="num text-ink-muted">
                        {[...new Set(assessments)].sort().join(", ")}
                      </td>
                      <td>
                        {new Set(assessments).size > 1 ? (
                          <span className="tag border-agent-line bg-agent-soft text-agent">
                            recurring
                          </span>
                        ) : (
                          <span className="tag border-line bg-surface-sunken text-ink-muted">
                            once
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">This assessment, {batch.assessment_id}</div>
            <span className="panel-sub">
              {current.length} diagnosed, {escalated.length} sent to you
            </span>
          </div>
          <div className="p-4 space-y-3">
            {current.map((d) => {
              const mark = batch.marks.find(
                (m) => m.learner_id === d.learner_id && m.question_id === d.question_id,
              );
              return (
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
                  awarded={mark ? `${mark.awarded} of ${mark.max_marks}` : undefined}
                  onOverride={() => onOverrideDiagnosis(d.learner_id, d.question_id)}
                />
              );
            })}
            {escalated.map((e) => (
              <div key={e.escalation_id} className="rounded-md border border-flag-line bg-flag-soft p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="tag border-flag-line bg-surface text-flag">{e.reason_code}</span>
                  <span className="text-sm font-medium text-ink">{e.subject}</span>
                </div>
                <p className="text-sm text-ink-muted">{e.reasoning}</p>
                <p className="text-xs text-ink-muted mt-1.5">
                  <span className="text-ink-faint">If forced: </span>
                  {e.would_have_decided}
                </p>
              </div>
            ))}
            {current.length === 0 && escalated.length === 0 && (
              <p className="text-sm text-ink-muted">
                Nothing lost marks for this learner on {batch.assessment_id}.
              </p>
            )}
          </div>
        </div>

        {Object.keys(byAssessment).length > 1 && (
          <div className="panel">
            <div className="panel-head">
              <div className="panel-title">Earlier assessments</div>
            </div>
            <table>
              <thead>
                <tr>
                  <th className="w-20">Assessment</th>
                  <th className="w-20">Question</th>
                  <th className="w-16">Node</th>
                  <th>What the agent said at the time</th>
                </tr>
              </thead>
              <tbody>
                {history
                  .filter((e) => e.assessment_id !== batch.assessment_id)
                  .map((e, i) => (
                    <tr key={i}>
                      <td className="num text-ink-muted">{e.assessment_id}</td>
                      <td className="num text-ink-muted">{e.question_id}</td>
                      <td className="num text-ink-muted">{e.taxonomy_node}</td>
                      <td className="text-xs text-ink-muted">{e.reasoning}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
