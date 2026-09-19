import clsx from "clsx";
import { DiagnosisDetail } from "../components/DiagnosisDetail";
import { ClassHeatmap } from "../components/charts/ClassHeatmap";
import { CountUp } from "../components/charts/CountUp";
import { Panel } from "../components/ui/Panel";
import { useSession } from "../hooks/useSession";
import { BRAND_NAME } from "../lib/brand";
import { pct } from "../lib/format";
import type { BatchResult, NodePattern } from "../types";

/** A pattern the teacher is looking at, and optionally one student within it. */
export interface Focus {
  node: string;
  learner: string | null;
}

/** The focus for a whole pattern: straight to the student when only one made it. */
export function focusOn(batch: BatchResult, node: string): Focus {
  const only = batch.patterns?.nodes.find((n) => n.node_id === node)?.learner_ids;
  return { node, learner: only && only.length === 1 ? only[0] : null };
}

/**
 * Four numbers that say where the problem lies, each in its own box. The class
 * average is left to the score chart below, which already names it.
 */
export function ClassFigures({ batch, named }: { batch: BatchResult; named: NodePattern[] }) {
  const { sharedThreshold, openCount } = useSession();
  const top = named[0];
  const repeating = new Set(named.flatMap((n) => n.recurring_learner_ids)).size;
  const size = batch.patterns?.cohort_size ?? batch.learners.length;
  const tiles = [
    {
      value: top ? pct(top.share) : "0%",
      label: "Share with the most common mistake",
      sub: top ? top.label : "No mistake patterns.",
    },
    {
      value: `${named.filter((n) => n.teaching_problem).length}`,
      label: "Mistakes that belong to the teaching",
      sub: `Made by ${pct(sharedThreshold)} or more of the class.`,
    },
    {
      value: `${repeating} of ${size}`,
      label: repeating === 1 ? "Student repeating a mistake" : "Students repeating a mistake",
      sub: "Also seen in an earlier test.",
    },
    {
      value: `${openCount}`,
      label: openCount === 1 ? "Finding waiting for your call" : "Findings waiting for your call",
      sub: `${BRAND_NAME} was not sure enough to decide these alone.`,
      flag: openCount > 0,
    },
  ];
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((t, i) => (
        <div
          key={t.label}
          className="anim-rise min-w-0 rounded border border-line bg-surface px-4 py-3.5"
          style={{ animationDelay: `${i * 70}ms` }}
        >
          <dd
            className={clsx(
              "text-3xl font-semibold leading-9 tabular-nums",
              t.flag ? "text-flag" : "text-agent",
            )}
          >
            <CountUp value={t.value} />
          </dd>
          <dt className="text-sm font-medium text-ink">{t.label}</dt>
          <dd className="truncate text-xs text-ink-muted" title={t.sub}>
            {t.sub}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The headline under the numbers. A whole-class problem carries the re-teach the
 * plan drafted for it, so the teacher reads what to try without leaving the page.
 */
export function WholeClass({
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
      <section className="anim-rise rounded border border-line bg-surface px-5 py-4">
        <h2 className="text-base font-semibold text-ink">No whole-class problems in this test.</h2>
        <p className="mt-1 text-sm text-ink-muted">
          A mistake becomes one when {pct(s.sharedThreshold)} or more of the class make it. The
          mistakes below belong to individual students.
        </p>
      </section>
    );
  }
  return (
    <section className="anim-rise rounded border border-agent-line bg-chart-wash px-5 py-4">
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

export function WhoPanel({
  batch,
  focus,
  onFocus,
}: {
  batch: BatchResult;
  focus: Focus | null;
  onFocus: (f: Focus) => void;
}) {
  const s = useSession();
  if (!batch.patterns) return null;
  return (
    <Panel
      title="Who made which mistake"
      subtitle="Read down a column for the class, across a row for one student. Select a square to see the answer."
    >
      <ClassHeatmap
        patterns={batch.patterns}
        learners={batch.learners}
        threshold={s.sharedThreshold}
        selected={focus?.learner ? { learnerId: focus.learner, nodeId: focus.node } : null}
        onCell={(learner, node) => onFocus({ node, learner })}
      />
    </Panel>
  );
}

/** The students behind one mistake, and the chosen student's answer with its evidence. */
export function MistakeDetails({
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
  const found = focus.learner
    ? batch.diagnoses.filter((d) => d.taxonomy_node === focus.node && d.learner_id === focus.learner)
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
              className={clsx("btn btn-xs", focus.learner === id && "border-agent bg-agent text-white hover:bg-agent")}
            >
              {s.learnerName(id)}
            </button>
          ))}
        </div>
      )}
      {!focus.learner && <p className="text-sm text-ink-muted">Choose a student to see their answer.</p>}
      {focus.learner && found.length === 0 && (
        <p className="text-sm text-ink-muted">
          This mistake was recorded from an earlier test. There is no answer from this test to show.
        </p>
      )}
      <FoundAnswers batch={batch} found={found} />
    </Panel>
  );
}

function FoundAnswers({ batch, found }: { batch: BatchResult; found: BatchResult["diagnoses"] }) {
  const s = useSession();
  const meta = (id: string) => s.taxonomy?.nodes.find((n) => n.id === id);
  return (
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
  );
}
