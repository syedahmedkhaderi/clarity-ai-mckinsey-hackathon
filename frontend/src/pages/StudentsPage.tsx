import clsx from "clsx";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { insightsApi } from "../api/insights";
import { DiagnosisDetail } from "../components/DiagnosisDetail";
import { LearnerCard, type LearnerTotal, type LearnerTrend } from "../components/LearnerCard";
import { PageHeader, WorkSurface } from "../shell/WorkSurface";
import { Collapsible } from "../components/ui/Collapsible";
import { EmptyState } from "../components/ui/EmptyState";
import { Panel } from "../components/ui/Panel";
import { Tag } from "../components/ui/Tag";
import { StudentEmail } from "../features/email/StudentEmail";
import { useSession } from "../hooks/useSession";
import {
  REASON_LABELS,
  STUDENT_TAG_LABELS,
  mistakeHeadline,
  scoreText,
} from "../lib/format";
import type { BatchResult, Escalation, LearnerContext, Mark, ProfileEntry } from "../types";
import type { HistoryTest, InsightsHistory } from "../types/insights";

export function StudentsPage() {
  const { batch } = useSession();
  return batch ? <StudentsView batch={batch} /> : null;
}

/** What the list and the detail both need to know about one student. */
interface Summary {
  total: LearnerTotal | null;
  /** Mistake pattern id to the tests it showed up in, oldest first. */
  nodeTests: Record<string, string[]>;
  mainNode: string | null;
  /** True when the main finding is about the wording, not the maths. */
  wording: boolean;
  keeps: boolean;
  needsCall: boolean;
}

const byId = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

/**
 * Escalated marks are missing from batch.marks, so the total starts from all_marks.
 * A teacher's own mark change lives on the surviving mark, so that value wins.
 */
function totalFor(batch: BatchResult, learnerId: string): LearnerTotal | null {
  const kept = new Map(
    batch.marks.filter((m) => m.learner_id === learnerId).map((m) => [m.question_id, m]),
  );
  const all: Mark[] = (batch.all_marks ?? batch.marks).filter((m) => m.learner_id === learnerId);
  if (all.length === 0) return null;
  let awarded = 0;
  let outOf = 0;
  let draft = false;
  for (const m of all) {
    const mark = kept.get(m.question_id);
    awarded += (mark ?? m).awarded;
    outOf += m.max_marks;
    draft = draft || mark === undefined || mark.provisional;
  }
  return { awarded, outOf, draft };
}

function summarise(batch: BatchResult, learner: LearnerContext, entries: ProfileEntry[]): Summary {
  const id = learner.learner_id;
  const current = (batch.all_diagnoses ?? batch.diagnoses).filter(
    (d) => d.learner_id === id && d.taxonomy_node,
  );
  const seen: Record<string, Set<string>> = {};
  // The run on screen is the truth for its own test, so stored rows for it are skipped.
  for (const e of entries) {
    if (e.assessment_id !== batch.assessment_id) (seen[e.taxonomy_node] ||= new Set()).add(e.assessment_id);
  }
  const perNode: Record<string, number> = {};
  for (const d of current) {
    const node = d.taxonomy_node as string;
    (seen[node] ||= new Set()).add(batch.assessment_id);
    perNode[node] = (perNode[node] ?? 0) + 1;
  }
  const nodeTests = Object.fromEntries(
    Object.entries(seen).map(([node, tests]) => [node, [...tests].sort(byId)]),
  );
  const repeats = (node: string) => (nodeTests[node]?.length ?? 0) > 1;
  const ranked = Object.keys(perNode).sort(
    (a, b) => Number(repeats(b)) - Number(repeats(a)) || perNode[b] - perNode[a] || byId(a, b),
  );
  const mainNode = ranked[0] ?? null;
  return {
    total: totalFor(batch, id),
    nodeTests,
    mainNode,
    wording: current.some(
      (d) => d.taxonomy_node === mainNode && (d.language_flag || d.error_class === "language"),
    ),
    keeps: ranked.some(repeats),
    needsCall: batch.escalations.some((e) => e.learner_id === id && !e.resolved),
  };
}

/**
 * Real scores across tests, oldest first. Tests with different totals share the
 * largest total as the scale, so no number is ever rescaled.
 */
function trendsFor(history: InsightsHistory | undefined): Record<string, LearnerTrend> {
  const trends: Record<string, LearnerTrend> = {};
  if (!history) return trends;
  const tests = [...history.tests].sort((a, b) => byId(a.assessment_id, b.assessment_id));
  const outOf = Math.max(0, ...tests.map((t) => t.points_possible));
  for (const t of tests) {
    for (const row of t.learners) {
      const trend = (trends[row.learner_id] ||= { points: [], outOf });
      trend.points.push({ label: t.name, value: row.awarded });
    }
  }
  return trends;
}

function StudentsView({ batch }: { batch: BatchResult }) {
  const s = useSession();
  const [selectedId, setSelectedId] = useState(batch.learners[0]?.learner_id ?? "");
  const [query, setQuery] = useState("");
  const detailRef = useRef<HTMLDivElement>(null);

  const course = s.tests.find((t) => t.id === batch.assessment_id);
  const courseId = course?.course_id || course?.class_id || "C1";
  const confirmed = batch.marks.filter((m) => !m.provisional).length;
  // Correcting a finding changes the totals, so they refetch.
  const history = useQuery({
    queryKey: ["insights-history", courseId, batch.batch_id, confirmed, batch.overrides.length],
    queryFn: () => insightsApi.history(courseId),
    placeholderData: (previous) => previous,
  });

  const summaries = useMemo(
    () =>
      Object.fromEntries(
        batch.learners.map((l) => [l.learner_id, summarise(batch, l, s.profiles[l.learner_id] ?? [])]),
      ),
    [batch, s.profiles],
  );

  const trends = useMemo(() => trendsFor(history.data), [history.data]);

  const learner = batch.learners.find((l) => l.learner_id === selectedId) ?? batch.learners[0];
  if (!learner) {
    return <EmptyState title="There are no students in this analysis." />;
  }

  const choose = (id: string) => {
    setSelectedId(id);
    // Below the wide layout the detail sits under the list, so bring it into view.
    if (window.matchMedia("(max-width: 1023px)").matches) {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? batch.learners.filter((l) => l.learner_name.toLowerCase().includes(needle))
    : batch.learners;

  const rail = (
    <>
      <div className="border-b border-line px-4 pb-3 pt-4">
        <h1 className="text-base font-semibold text-ink">Students</h1>
        <p className="mt-0.5 text-xs text-ink-muted">Every total is a draft. Choose a student to see their work.</p>
        <input
          type="search"
          aria-label="Find a student"
          placeholder="Find a student"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mt-3 w-full rounded border border-line-strong bg-surface-sunken px-2.5 py-1.5 text-sm text-ink outline-none focus:border-ink focus:ring-1 focus:ring-ink"
        />
      </div>
      <div className="max-h-[50vh] overflow-y-auto lg:max-h-none">
        {shown.map((l) => {
          const sum = summaries[l.learner_id];
          return (
            <LearnerCard
              key={l.learner_id}
              learner={l}
              total={sum.total}
              trend={trends[l.learner_id] ?? null}
              mainPattern={s.patternName(sum.mainNode) || null}
              keepsHappening={sum.keeps}
              needsCall={sum.needsCall}
              selected={l.learner_id === learner.learner_id}
              onClick={() => choose(l.learner_id)}
            />
          );
        })}
        {shown.length === 0 && (
          <p className="px-4 py-5 text-sm text-ink-muted">No student matches that name.</p>
        )}
      </div>
    </>
  );

  return (
    <WorkSurface rail={rail} railWidth="320px" railFlush>
      <div ref={detailRef} className="-mx-4 -mt-4 md:-mx-6 md:-mt-6">
        <StudentDetail
          key={learner.learner_id}
          batch={batch}
          learner={learner}
          summary={summaries[learner.learner_id]}
          tests={history.data?.tests}
          historyState={history.isError ? "error" : history.data ? "ready" : "loading"}
        />
      </div>
    </WorkSurface>
  );
}

function StudentDetail({
  batch,
  learner,
  summary,
  tests,
  historyState,
}: {
  batch: BatchResult;
  learner: LearnerContext;
  summary: Summary;
  tests: HistoryTest[] | undefined;
  historyState: "loading" | "ready" | "error";
}) {
  const s = useSession();
  const thisTest = s.testName(batch.assessment_id);
  const { total, mainNode, keeps, wording } = summary;
  const earlier = (s.profiles[learner.learner_id] ?? []).filter(
    (e) => e.assessment_id !== batch.assessment_id,
  );

  const found = (batch.all_diagnoses ?? batch.diagnoses).filter(
    (d) => d.learner_id === learner.learner_id && d.taxonomy_node,
  ).length;
  const open = batch.escalations.filter(
    (e) => e.learner_id === learner.learner_id && !e.resolved,
  ).length;

  return (
    <>
      <PageHeader
        title={learner.learner_name}
        subtitle={mistakeHeadline(learner.learner_name, mainNode ? s.patternName(mainNode) : null, keeps, wording)}
        figures={[
          {
            label: total?.draft === false ? "Confirmed total" : "Draft total",
            value: total ? `${scoreText(total.awarded)} of ${scoreText(total.outOf)}` : "No marks",
          },
          { label: "Mistakes found", value: found },
          { label: "Waiting for you", value: open, tone: open > 0 ? "flag" : "default" },
        ]}
      />
      <div className="space-y-6 p-4 md:p-6">
      <Findings batch={batch} learner={learner} thisTest={thisTest} />
      <PatternsTable summary={summary} />
      <HistoryStrip
        learner={learner}
        currentId={batch.assessment_id}
        tests={tests}
        state={historyState}
      />

      {earlier.length > 0 && (
        <Collapsible
          title="Earlier tests"
          hint={`${earlier.length} earlier ${earlier.length === 1 ? "finding" : "findings"}`}
        >
          <div className="overflow-x-auto -mx-4 -my-4">
            <table>
              <thead>
                <tr>
                  <th>Question</th>
                  <th>Mistake pattern</th>
                  <th>What we noticed at the time</th>
                </tr>
              </thead>
              <tbody>
                {earlier.map((e, i) => (
                  <tr key={i}>
                    <td className="text-xs text-ink-muted whitespace-nowrap">{s.questionName(e.question_id)}</td>
                    <td className="text-xs text-ink">{s.patternName(e.taxonomy_node)}</td>
                    <td className="text-xs text-ink-muted">{s.plain(e.reasoning)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Collapsible>
      )}

      <StudentEmail learnerId={learner.learner_id} />
      </div>
    </>
  );
}

function HistoryStrip({
  learner,
  currentId,
  tests,
  state,
}: {
  learner: LearnerContext;
  currentId: string;
  tests: HistoryTest[] | undefined;
  state: "loading" | "ready" | "error";
}) {
  const s = useSession();
  const missing = learner.assessments_expected.filter((a) => !learner.assessments_present.includes(a));
  const ordered = [...(tests ?? [])].sort((a, b) => byId(a.assessment_id, b.assessment_id));

  return (
    <Panel title="Scores across tests">
      {state === "loading" && <p className="text-sm text-ink-faint">Loading scores.</p>}
      {state === "error" && (
        <p className="text-sm text-ink-muted">Earlier scores could not be loaded. The rest of this page is fine.</p>
      )}
      {ordered.length > 0 && (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {ordered.map((t) => {
              const row = t.learners.find((l) => l.learner_id === learner.learner_id);
              const share = row && t.points_possible > 0 ? Math.min(1, row.awarded / t.points_possible) : 0;
              return (
                <div
                  key={t.assessment_id}
                  className={
                    "w-16 shrink-0 rounded px-1 py-1.5 text-center " +
                    (t.assessment_id === currentId ? "bg-surface-sunken" : "")
                  }
                >
                  <div className="text-xs tabular-nums h-4 text-ink">
                    {row ? scoreText(row.awarded) : ""}
                  </div>
                  <div className="h-16 flex items-end justify-center">
                    {row ? (
                      <div
                        className={
                          "w-7 rounded-sm border border-line-strong " +
                          (row.provisional ? "bg-line" : "bg-ink-muted border-ink-muted")
                        }
                        style={{ height: `${Math.max(4, share * 100)}%` }}
                        title={`${t.name}: ${scoreText(row.awarded)} of ${scoreText(t.points_possible)}`}
                      />
                    ) : (
                      <div className="w-7 h-full rounded-sm border border-dashed border-line-strong" />
                    )}
                  </div>
                  <div className="mt-1 text-2xs text-ink-muted truncate" title={t.name}>
                    {row ? t.name : "Missed"}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-2xs text-ink-faint mt-2">Pale bars are drafts. Dark bars are confirmed.</p>
        </>
      )}
      {missing.length > 0 && (
        <p className="text-xs text-ink-muted mt-3">
          No record for {missing.map(s.testName).join(", ")}.{" "}
          {learner.low_confidence_history
            ? "Less than half of the earlier tests are on record, so any claim that a mistake keeps happening is treated with care and handed to you."
            : "The gaps are allowed for. This student was not left out."}
        </p>
      )}
    </Panel>
  );
}

function PatternsTable({ summary }: { summary: Summary }) {
  const s = useSession();
  const rows = Object.entries(summary.nodeTests).sort(
    (a, b) => b[1].length - a[1].length || byId(a[0], b[0]),
  );
  return (
    <Panel
      title="Mistake patterns across tests"
      subtitle="This is what a score cannot show: whether it is the same mistake again."
      flush
    >
      {rows.length === 0 ? (
        <p className="px-4 py-5 text-sm text-ink-muted">No mistake patterns are on record for this student.</p>
      ) : (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Mistake pattern</th>
                <th>Seen in</th>
                <th className="w-40">How often</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([node, tests]) => (
                <tr key={node}>
                  <td className="text-sm text-ink">{s.patternName(node)}</td>
                  <td className="text-xs text-ink-muted">{tests.map(s.testName).join(", ")}</td>
                  <td>
                    {tests.length > 1 ? (
                      <Tag tone="agent">{STUDENT_TAG_LABELS.keepsHappening}</Tag>
                    ) : (
                      <Tag>{STUDENT_TAG_LABELS.once}</Tag>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function Findings({
  batch,
  learner,
  thisTest,
}: {
  batch: BatchResult;
  learner: LearnerContext;
  thisTest: string;
}) {
  const s = useSession();
  const id = learner.learner_id;
  const nodeMeta = (node: string | null) => s.taxonomy?.nodes.find((n) => n.id === node);
  const marks = new Map(
    (batch.all_marks ?? batch.marks).filter((m) => m.learner_id === id).map((m) => [m.question_id, m]),
  );
  const escalations = batch.escalations.filter((e) => e.learner_id === id);
  const waiting = (q: string) => escalations.some((e) => e.question_id === q && !e.resolved);
  // Answers waiting on the teacher come first; the rest stay in question order.
  const diagnoses = (batch.all_diagnoses ?? batch.diagnoses)
    .filter((d) => d.learner_id === id && d.taxonomy_node)
    .sort(
      (a, b) =>
        Number(waiting(b.question_id)) - Number(waiting(a.question_id)) ||
        byId(a.question_id, b.question_id),
    );
  const paired = new Set(diagnoses.map((d) => d.question_id));
  const unpaired = escalations.filter((e) => !e.question_id || !paired.has(e.question_id));
  const open = escalations.filter((e) => !e.resolved).length;

  return (
    <Panel
      flush
      title={`This test, ${thisTest}`}
      subtitle={`${diagnoses.length} ${diagnoses.length === 1 ? "finding" : "findings"}, ${open} need${open === 1 ? "s" : ""} your call`}
    >
      <div className="space-y-3 bg-surface-sunken p-3 md:p-4">
        {diagnoses.map((d) => {
          const mark = marks.get(d.question_id);
          const flagged = escalations.filter((e) => e.question_id === d.question_id);
          return (
            <div key={d.question_id} className="space-y-2">
              <DiagnosisDetail
                diagnosis={d}
                question={s.questions.find((q) => q.question_id === d.question_id)}
                answer={
                  batch.submissions.find(
                    (x) => x.learner_id === id && x.question_id === d.question_id,
                  )?.answer ?? ""
                }
                node={nodeMeta(d.taxonomy_node)}
                alternative={nodeMeta(d.alternative_node)}
                awarded={mark ? `${scoreText(mark.awarded)} of ${scoreText(mark.max_marks)}` : undefined}
                needsCall={flagged.some((e) => !e.resolved)}
                onOverride={() => s.overrideDiagnosis(id, d.question_id)}
              />
              {flagged.map((e) => (
                <EscalationNote key={e.escalation_id} escalation={e} />
              ))}
            </div>
          );
        })}
        {unpaired.map((e) => (
          <EscalationNote key={e.escalation_id} escalation={e} />
        ))}
        {diagnoses.length === 0 && unpaired.length === 0 && (
          <p className="text-sm text-ink-muted">
            No marks were lost to a mistake pattern on {thisTest}.
          </p>
        )}
      </div>
    </Panel>
  );
}

function EscalationNote({ escalation: e }: { escalation: Escalation }) {
  const { plain } = useSession();
  return (
    <div className={clsx("overflow-hidden rounded-sm border", e.resolved ? "border-line" : "border-flag")}>
      <div
        className={clsx(
          "flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2",
          e.resolved ? "bg-surface-raised text-ink-muted" : "bg-flag text-white",
        )}
      >
        <span className="text-2xs font-semibold uppercase tracking-wider opacity-80">
          {e.resolved ? "Decided" : "Needs your call"}
        </span>
        <span className="text-sm font-medium">{plain(e.subject)}</span>
        <span className={clsx("text-xs", e.resolved ? "text-ink-muted" : "text-white/80")}>
          {REASON_LABELS[e.reason_code] ?? e.reason_code}
        </span>
      </div>
      <div className="bg-surface px-3 py-2.5">
        <p className="text-sm text-ink-muted">{plain(e.reasoning)}</p>
        <p className="mt-1.5 text-xs text-ink-muted">
          <span className="text-ink-faint">If it had to choose: </span>
          {plain(e.would_have_decided)}
        </p>
      </div>
    </div>
  );
}
