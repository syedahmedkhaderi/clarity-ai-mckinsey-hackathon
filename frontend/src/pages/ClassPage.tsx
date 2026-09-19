import { useQuery, type UseQueryResult } from "@tanstack/react-query";
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
import { namedPatterns, plural, roundOne, studentScores } from "./classStats";
import { BarLink, PageHeader, PagePad, Tabs, TopBar, TopSurface } from "../shell/WorkSurface";

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

type ClassTab = "mistakes" | "who" | "trend";

const CLASS_TABS: { key: ClassTab; label: string }[] = [
  { key: "mistakes", label: "Which mistakes" },
  { key: "who", label: "Who made which" },
  { key: "trend", label: "Across tests" },
];

/**
 * The class page answers one question first: is this one student, or the way it
 * was taught? The whole-class problems and four numbers sit on top; the three
 * views below are sections the teacher switches between rather than scrolls to.
 */
function ClassView({ batch }: { batch: BatchResult }) {
  const s = useSession();
  const { setView } = useAppView();
  const [focus, setFocus] = useState<Focus | null>(null);
  const [tab, setTab] = useState<ClassTab>("mistakes");
  const details = useRef<HTMLDivElement>(null);
  const patterns = batch.patterns;
  const history = useQuery({
    queryKey: ["insights-history", batch.cohort_id, s.batchId],
    queryFn: () => insightsApi.history(batch.cohort_id),
  });

  useEffect(() => {
    if (focus) details.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focus]);

  if (!patterns) {
    return (
      <PagePad>
        <p className="text-sm text-ink-muted">There is no class picture for this analysis.</p>
      </PagePad>
    );
  }

  const named = namedPatterns(patterns.nodes);
  const open = (node: string) => {
    const only = patterns.nodes.find((n) => n.node_id === node)?.learner_ids;
    setFocus({ node, learner: only && only.length === 1 ? only[0] : null });
  };
  const seeWho = (node: string) => {
    open(node);
    setTab("who");
  };

  const header = (
    <PageHeader
      title="Class"
      subtitle={`${plural(patterns.cohort_size, "student")} took ${s.testName(patterns.assessment_id)}. This page shows whether a mistake belongs to one student or to the whole class.`}
      action={<BarLink title="Open the action plan" onClick={() => setView("plan")} />}
    />
  );

  return (
    <TopSurface
      header={header}
      bar={
        <TopBar>
          <ClassFigures batch={batch} named={named} history={history.data} />
        </TopBar>
      }
    >
      <div className="space-y-6">
        <WholeClass batch={batch} problems={named.filter((n) => n.teaching_problem)} onSee={seeWho} />
        <div className="border-b border-line">
          <Tabs tabs={CLASS_TABS} active={tab} onTab={setTab} />
        </div>
        {tab === "mistakes" && (
          <MistakesSection patterns={patterns} named={named} onOpen={open} />
        )}
        {tab === "who" && (
          <Panel
            title="Who made which mistake"
            subtitle="Read down a column for the class, across a row for one student. Select a square to see the answer."
          >
            <ClassHeatmap
              patterns={patterns}
              learners={batch.learners}
              threshold={s.sharedThreshold}
              selected={focus?.learner ? { learnerId: focus.learner, nodeId: focus.node } : null}
              onCell={(learner, node) => setFocus({ node, learner })}
            />
          </Panel>
        )}
        {tab === "trend" && <ClassTrend history={history} />}

        <div ref={details}>
          {focus && tab !== "trend" && <Details batch={batch} focus={focus} onFocus={setFocus} />}
        </div>
      </div>
    </TopSurface>
  );
}

/** The class average against the test before, and three counts that say where the problem lies. */
function ClassFigures({
  batch,
  named,
  history,
}: {
  batch: BatchResult;
  named: NodePattern[];
  history: InsightsHistory | undefined;
}) {
  const scores = studentScores(batch);
  const outOf = Math.max(0, ...scores.map((x) => x.possible));
  const mean = scores.length ? scores.reduce((a, x) => a + x.awarded, 0) / scores.length : 0;
  const prev = previousAverage(history, batch.assessment_id);
  const top = named[0];
  const repeating = new Set(named.flatMap((n) => n.recurring_learner_ids)).size;
  const { sharedThreshold, testName } = useSession();
  const tiles = [
    {
      value: roundOne(mean),
      label: `Class average out of ${outOf}`,
      sub: prev ? `It was ${roundOne(prev.value)} on ${testName(prev.id)}.` : "The first test on record.",
    },
    {
      value: top ? pct(top.share) : "0%",
      label: "Share the most common mistake",
      sub: top ? top.label : "No mistake patterns.",
    },
    {
      value: `${named.filter((n) => n.teaching_problem).length}`,
      label: "Belong to the teaching",
      sub: `Made by ${pct(sharedThreshold)} or more of the class.`,
    },
    {
      value: `${repeating}`,
      label: repeating === 1 ? "Student repeating a mistake" : "Students repeating a mistake",
      sub: "Also seen in an earlier test.",
    },
  ];
  return (
    <dl className="grid w-full grid-cols-2 gap-x-6 gap-y-4 py-2 lg:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="min-w-0">
          <dd className="text-3xl font-semibold leading-9 tabular-nums text-ink">{t.value}</dd>
          <dt className="text-sm font-medium text-ink">{t.label}</dt>
          <dd className="truncate text-xs text-ink-muted" title={t.sub}>
            {t.sub}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The mean of the analysed test just before this one, when there is one on the same scale. */
function previousAverage(
  history: InsightsHistory | undefined,
  current: string,
): { id: string; value: number } | null {
  if (!history) return null;
  const tests = history.tests.filter((t) => t.learners.length > 0 && t.points_possible > 0);
  const at = tests.findIndex((t) => t.assessment_id === current);
  const before = at > 0 ? tests[at - 1] : null;
  const now = at >= 0 ? tests[at] : null;
  if (!before || !now || before.points_possible !== now.points_possible) return null;
  const value = before.learners.reduce((a, l) => a + l.awarded, 0) / before.learners.length;
  return { id: before.assessment_id, value };
}

/**
 * The headline of the page. A whole-class problem carries the re-teach the plan
 * drafted for it, so the teacher reads what to try without leaving the page.
 */
function WholeClass({
  batch,
  problems,
  onSee,
}: {
  batch: BatchResult;
  problems: NodePattern[];
  onSee: (node: string) => void;
}) {
  const s = useSession();
  const actions = [...(batch.plan?.scheduled ?? []), ...(batch.plan?.dropped ?? [])];
  const script = (node: string) =>
    actions.find((a) => a.type === "group_reteach" && a.node_id === node)?.facilitator_script;

  if (problems.length === 0) {
    return (
      <section className="rounded border border-line bg-surface px-5 py-4">
        <h2 className="text-base font-semibold text-ink">No whole-class problems in this test.</h2>
        <p className="mt-1 text-sm text-ink-muted">
          A mistake becomes one when {pct(s.sharedThreshold)} or more of the class make it. The
          mistakes on this page belong to individual students.
        </p>
      </section>
    );
  }
  return (
    <section className="rounded bg-chart-wash px-5 py-4">
      <h2 className="text-lg font-semibold text-chart-deep">
        {problems.length === 1 ? "One whole-class problem" : `${problems.length} whole-class problems`}
      </h2>
      <ul className="mt-3 space-y-4">
        {problems.map((n) => (
          <li key={n.node_id} className="max-w-4xl">
            <p className="text-base font-semibold text-ink">{n.label}</p>
            <p className="text-sm text-chart-deep">
              {n.count} of {n.cohort_size} students, {pct(n.share)} of the class. That points to a
              gap in the teaching, not {n.count} separate student problems.
            </p>
            {script(n.node_id) && (
              <p className="mt-1 text-sm text-ink">
                <span className="font-semibold">Try this: </span>
                {s.plain(script(n.node_id) ?? "")}
              </p>
            )}
            <button className="btn btn-xs mt-2" onClick={() => onSee(n.node_id)}>
              See which students
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Every mistake against the whole-class line, and the ones below it in words. */
function MistakesSection({
  patterns,
  named,
  onOpen,
}: {
  patterns: CohortPatterns;
  named: NodePattern[];
  onOpen: (node: string) => void;
}) {
  const s = useSession();
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
      <Panel title="How many students made each mistake" subtitle="Select a mistake to see who made it.">
        <PatternBars
          threshold={s.sharedThreshold}
          onSelect={onOpen}
          rows={named.map((n) => ({
            id: n.node_id,
            label: n.label,
            count: n.count,
            cohortSize: n.cohort_size,
            kind: n.kind,
          }))}
        />
      </Panel>
      <div className="space-y-6">
        <TheRest named={named.filter((n) => !n.teaching_problem)} onOpen={onOpen} />
        <TooFew patterns={patterns} />
      </div>
    </div>
  );
}

/** Below the line: not a re-teach, so each gets the smaller response that fits it. */
function TheRest({ named, onOpen }: { named: NodePattern[]; onOpen: (node: string) => void }) {
  const { sharedThreshold } = useSession();
  if (named.length === 0) return null;
  // A mistake one student made is listed in the chart beside this; naming each again
  // here would only repeat it, so they are counted in one line.
  const several = named.filter((n) => n.count > 1);
  const singles = named.length - several.length;
  return (
    <Panel
      title="The rest, briefly"
      subtitle={`Below the ${pct(sharedThreshold)} line. Not a re-teach: a pairing, a word at the break, or a few minutes with one student.`}
      flush
    >
      <ul className="divide-y divide-line">
        {several.map((n) => (
          <li key={n.node_id} className="px-4 py-2.5">
            <div className="flex items-baseline gap-3">
              <button
                type="button"
                onClick={() => onOpen(n.node_id)}
                className="text-left text-sm font-medium text-ink hover:underline"
              >
                {n.label}
              </button>
              <span className="num ml-auto shrink-0 text-ink-muted">
                {n.count} of {n.cohort_size}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-ink-muted">
              Too few for class time. Pair them with someone who has it, or catch them at the break.
            </p>
          </li>
        ))}
        {singles > 0 && (
          <li className="px-4 py-2.5">
            <p className="text-sm font-medium text-ink">
              {singles === 1 ? "One more mistake, made by one student." : `${singles} more mistakes, each made by one student.`}
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">
              A few minutes with each of them when there is time. Select one in the chart to see who.
            </p>
          </li>
        )}
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
          <span className="text-xs text-ink-muted">
            Students who made this mistake:
          </span>
          {node.learner_ids.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={focus.learner === id}
              onClick={() => onFocus({ node: focus.node, learner: id })}
              className={clsx(
                "btn btn-xs",
                focus.learner === id &&
                  "border-ink bg-ink text-white hover:bg-ink",
              )}
            >
              {s.learnerName(id)}
            </button>
          ))}
        </div>
      )}

      {!focus.learner && (
        <p className="text-sm text-ink-muted">
          Choose a student to see their answer.
        </p>
      )}
      {focus.learner && found.length === 0 && (
        <p className="text-sm text-ink-muted">
          This mistake was recorded from an earlier test. There is no answer
          from this test to show.
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
                (x) =>
                  x.learner_id === d.learner_id &&
                  x.question_id === d.question_id,
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
  if (few.length === 0 && skipped.length === 0 && patterns.notes.length === 0)
    return null;
  return (
    <Panel
      title="Too few students to tell"
      subtitle="These showed up, but not for enough students to call them a pattern."
      flush
    >
      <ul className="divide-y divide-line">
        {few.map((n) => (
          <li
            key={n.node_id}
            className="flex flex-wrap items-baseline gap-x-3 px-4 py-2.5"
          >
            <span className="text-sm text-ink">{n.label}</span>
            <span className="text-xs text-ink-muted">
              {n.learner_ids.map(s.learnerName).join(", ")}
            </span>
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
function ClassTrend({ history }: { history: UseQueryResult<InsightsHistory> }) {
  const s = useSession();
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
  const tests = data.tests.filter(
    (t) => t.learners.length > 0 && t.points_possible > 0,
  );
  const same = tests.every(
    (t) => t.points_possible === tests[0].points_possible,
  );
  const points = tests.map((t) => {
    const mean =
      t.learners.reduce((a, l) => a + l.awarded, 0) / t.learners.length;
    return {
      label: testName(t.assessment_id),
      value: same ? mean : (mean / t.points_possible) * 100,
    };
  });
  return {
    points,
    outOf: same && tests[0] ? tests[0].points_possible : 100,
    percent: !same,
  };
}

function trendCaption(data: InsightsHistory | undefined): string {
  if (!data) return "";
  const { points, percent, outOf } = trendPoints(data, (id) => id);
  if (points.length < 2)
    return "There is only one test so far, so there is no trend to show.";
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
  if (points.length === 0)
    return <p className="text-sm text-ink-muted">No analysed tests yet.</p>;
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
          Averages include every draft mark.
        </p>
      )}
    </div>
  );
}
