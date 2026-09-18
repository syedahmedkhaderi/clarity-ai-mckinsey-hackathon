import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { insightsApi } from "../api/insights";
import { DiagnosisDetail } from "../components/DiagnosisDetail";
import { ClassHeatmap } from "../components/charts/ClassHeatmap";
import { PatternBars } from "../components/charts/PatternBars";
import { Sparkline } from "../components/charts/Sparkline";
import { Panel } from "../components/ui/Panel";
import { useAppView } from "../hooks/useAppView";
import { useSession } from "../hooks/useSession";
import { pct } from "../lib/format";
import type { BatchResult, CohortPatterns, NodePattern } from "../types";
import type { InsightsHistory } from "../types/insights";
import { namedPatterns, plural, roundOne } from "./classStats";

/** A pattern the teacher is looking at, and optionally one student within it. */
interface Focus {
  node: string;
  learner: string | null;
}

/** Rendered only once a run exists; the app shows the "run first" notice otherwise. */
export function ClassPage() {
  const { batch } = useSession();
  return batch ? <ClassView batch={batch} /> : null;
}

function ClassView({ batch }: { batch: BatchResult }) {
  const s = useSession();
  const [focus, setFocus] = useState<Focus | null>(null);
  const details = useRef<HTMLDivElement>(null);
  const patterns = batch.patterns;

  useEffect(() => {
    if (focus) details.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focus]);

  if (!patterns) {
    return <p className="text-sm text-ink-muted">There is no class picture for this analysis.</p>;
  }

  const named = namedPatterns(patterns.nodes);
  const whole = named.filter((n) => n.teaching_problem);
  const open = (node: string) => {
    const only = patterns.nodes.find((n) => n.node_id === node)?.learner_ids;
    setFocus({ node, learner: only && only.length === 1 ? only[0] : null });
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold text-ink">Class</h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          {plural(patterns.cohort_size, "student")} took {s.testName(patterns.assessment_id)}. This
          page shows whether a mistake belongs to one student or to the whole class.
        </p>
      </header>

      <WholeClassBanner problems={whole} onSee={open} />

      <Panel
        title="How many students made each mistake"
        subtitle="Select a mistake to see who made it."
      >
        <PatternBars
          threshold={s.sharedThreshold}
          onSelect={open}
          rows={named.map((n) => ({
            id: n.node_id,
            label: n.label,
            count: n.count,
            cohortSize: n.cohort_size,
            kind: n.kind,
          }))}
        />
      </Panel>

      <Panel
        title="Who made which mistake"
        subtitle="Select a square to see the student's answer and why marks were lost."
      >
        <ClassHeatmap
          patterns={patterns}
          learners={batch.learners}
          threshold={s.sharedThreshold}
          selected={focus?.learner ? { learnerId: focus.learner, nodeId: focus.node } : null}
          onCell={(learner, node) => setFocus({ node, learner })}
        />
      </Panel>

      <div ref={details}>
        {focus && <Details batch={batch} focus={focus} onFocus={setFocus} />}
      </div>

      <TooFew patterns={patterns} />
      <ClassTrend courseId={batch.cohort_id} />
    </div>
  );
}

function WholeClassBanner({
  problems,
  onSee,
}: {
  problems: NodePattern[];
  onSee: (node: string) => void;
}) {
  const { setView } = useAppView();
  const s = useSession();
  if (problems.length === 0) {
    return (
      <Panel>
        <p className="text-sm text-ink">No mistake is shared by enough of the class to be a whole-class problem.</p>
        <p className="mt-0.5 text-xs text-ink-muted">
          A mistake becomes one when {pct(s.sharedThreshold)} or more of the class make it. The
          mistakes below belong to individual students.
        </p>
      </Panel>
    );
  }
  return (
    <Panel
      tone="agent"
      flush
      title={problems.length === 1 ? "One whole-class problem" : `${problems.length} whole-class problems`}
      action={
        <button className="btn btn-xs" onClick={() => setView("plan")}>
          Open action plan
        </button>
      }
    >
      <ul className="divide-y divide-line">
        {problems.map((n) => {
          const hint = s.taxonomy?.nodes.find((x) => x.id === n.node_id)?.remediation_hint;
          return (
            <li key={n.node_id} className="px-4 py-3">
              <p className="text-sm text-ink">
                <span className="num font-medium">
                  {n.count} of {n.cohort_size}
                </span>{" "}
                students made the same mistake: <span className="font-medium">{n.label}</span>.
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                That is {pct(n.share)} of the class, so it points to a gap in the teaching, not{" "}
                {n.count} separate student problems.
              </p>
              {hint && <p className="mt-1 text-xs text-ink-faint">Next step: {s.plain(hint)}</p>}
              <button className="btn btn-xs mt-2" onClick={() => onSee(n.node_id)}>
                See which students
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function Details({
  batch,
  focus,
  onFocus,
}: {
  batch: BatchResult;
  focus: Focus;
  onFocus: (f: Focus | null) => void;
}) {
  const s = useSession();
  const node = batch.patterns?.nodes.find((n) => n.node_id === focus.node);
  const meta = (id: string) => s.taxonomy?.nodes.find((n) => n.id === id);
  const found = focus.learner
    ? batch.diagnoses.filter(
        (d) => d.taxonomy_node === focus.node && d.learner_id === focus.learner,
      )
    : [];

  return (
    <Panel
      title={
        focus.learner
          ? `${s.learnerName(focus.learner)}: ${s.patternName(focus.node)}`
          : s.patternName(focus.node)
      }
      action={
        <button className="btn btn-xs" onClick={() => onFocus(null)}>
          Close
        </button>
      }
    >
      {node && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-muted">Students who made this mistake:</span>
          {node.learner_ids.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={focus.learner === id}
              onClick={() => onFocus({ node: focus.node, learner: id })}
              className={clsx(
                "btn btn-xs",
                focus.learner === id && "border-ink bg-ink text-white hover:bg-ink",
              )}
            >
              {s.learnerName(id)}
            </button>
          ))}
        </div>
      )}

      {!focus.learner && (
        <p className="text-sm text-ink-muted">Choose a student to see their answer.</p>
      )}
      {focus.learner && found.length === 0 && (
        <p className="text-sm text-ink-muted">
          This mistake was recorded from an earlier test. There is no answer from this test to show.
        </p>
      )}
      <div className="space-y-3">
        {found.map((d) => (
          <DiagnosisDetail
            key={d.question_id}
            diagnosis={d}
            question={s.questions.find((q) => q.question_id === d.question_id)}
            answer={
              batch.submissions.find(
                (x) => x.learner_id === d.learner_id && x.question_id === d.question_id,
              )?.answer ?? ""
            }
            node={meta(d.taxonomy_node ?? "")}
            alternative={meta(d.alternative_node ?? "")}
            onOverride={() => s.overrideDiagnosis(d.learner_id, d.question_id)}
          />
        ))}
      </div>
    </Panel>
  );
}

function TooFew({ patterns }: { patterns: CohortPatterns }) {
  const s = useSession();
  const few = patterns.nodes.filter((n) => n.kind === "insufficient_data");
  const skipped = patterns.skipped_topics.map(s.topicName);
  if (few.length === 0 && skipped.length === 0 && patterns.notes.length === 0) return null;
  return (
    <Panel
      title="Too few students to tell"
      subtitle="These showed up, but not for enough students to call them a pattern."
      flush
    >
      <ul className="divide-y divide-line">
        {few.map((n) => (
          <li key={n.node_id} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2.5">
            <span className="text-sm text-ink">{n.label}</span>
            <span className="text-xs text-ink-muted">{n.learner_ids.map(s.learnerName).join(", ")}</span>
            <span className="num ml-auto text-ink-muted">
              {n.count} of {n.cohort_size}
            </span>
          </li>
        ))}
        {skipped.length > 0 && (
          <li className="px-4 py-2.5 text-xs text-ink-muted">
            Not enough answers to judge these topics: {skipped.join(", ")}.
          </li>
        )}
        {patterns.notes.map((note, i) => (
          <li key={i} className="px-4 py-2.5 text-xs text-ink-muted">
            {s.plain(note)}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** The class average on each test so far, drawn from every analysed test in the class. */
function ClassTrend({ courseId }: { courseId: string }) {
  const s = useSession();
  const history = useQuery({
    queryKey: ["insights-history", courseId, s.batchId],
    queryFn: () => insightsApi.history(courseId),
  });

  return (
    <Panel title="How the class is doing across tests" subtitle={trendCaption(history.data)}>
      {history.isLoading && <p className="text-sm text-ink-faint">Loading the earlier tests.</p>}
      {history.isError && (
        <p className="text-sm text-ink-muted">The results from earlier tests could not be loaded.</p>
      )}
      {history.data && <TrendBody data={history.data} testName={s.testName} />}
    </Panel>
  );
}

function trendPoints(data: InsightsHistory, testName: (id: string) => string) {
  const tests = data.tests.filter((t) => t.learners.length > 0 && t.points_possible > 0);
  const same = tests.every((t) => t.points_possible === tests[0].points_possible);
  const points = tests.map((t) => {
    const mean = t.learners.reduce((a, l) => a + l.awarded, 0) / t.learners.length;
    return {
      label: testName(t.assessment_id),
      value: same ? mean : (mean / t.points_possible) * 100,
    };
  });
  return { points, outOf: same && tests[0] ? tests[0].points_possible : 100, percent: !same };
}

function trendCaption(data: InsightsHistory | undefined): string {
  if (!data) return "";
  const { points, percent, outOf } = trendPoints(data, (id) => id);
  if (points.length < 2) return "There is only one test so far, so there is no trend to show.";
  return percent
    ? "Class average on each test, as a percentage of the marks on offer."
    : `Class average on each test, out of ${outOf} marks.`;
}

function TrendBody({
  data,
  testName,
}: {
  data: InsightsHistory;
  testName: (id: string) => string;
}) {
  const { points, outOf, percent } = trendPoints(data, testName);
  const draft = data.tests.some((t) => t.learners.some((l) => l.provisional));
  if (points.length === 0) return <p className="text-sm text-ink-muted">No analysed tests yet.</p>;
  return (
    <div>
      <Sparkline
        size="large"
        points={points}
        outOf={outOf}
        format={(v) => (percent ? `${Math.round(v)}%` : roundOne(v))}
      />
      {draft && (
        <p className="mt-3 text-2xs text-ink-faint">
          Averages include draft marks until you confirm them.
        </p>
      )}
    </div>
  );
}
