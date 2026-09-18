import { Panel } from "../components/ui/Panel";
import { StatTile } from "../components/ui/StatTile";
import { Tag } from "../components/ui/Tag";
import { PatternBars } from "../components/charts/PatternBars";
import { QuestionBars } from "../components/charts/QuestionBars";
import { ScoreDistribution } from "../components/charts/ScoreDistribution";
import { TimeBudgetDonut } from "../components/charts/TimeBudgetDonut";
import { useAppView } from "../hooks/useAppView";
import { useSession } from "../hooks/useSession";
import { analysisLabel, pct } from "../lib/format";
import type { BatchResult } from "../types";
import {
  droppedMinutes,
  marksLost,
  namedPatterns,
  plural,
  questionRows,
  roundOne,
  studentScores,
} from "./classStats";

const TOP_PATTERNS = 5;

/** What a teacher wants after a run: the class in four numbers, four pictures, and where to go next. */
export function HomeSummary({ batch }: { batch: BatchResult }) {
  const s = useSession();
  const scores = studentScores(batch);
  const { lost, possible } = marksLost(scores);
  const outOf = Math.max(0, ...scores.map((x) => x.possible));
  const totals = scores.map((x) => x.awarded);
  const mean = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
  const questions = questionRows(batch, s.topicName);
  const hardest = [...questions].sort((a, b) => a.correct / (a.total || 1) - b.correct / (b.total || 1))[0];
  const patterns = namedPatterns(batch.patterns?.nodes ?? []);
  const whole = patterns.filter((n) => n.teaching_problem);
  const plan = batch.plan;

  return (
    <section className="space-y-5" aria-label="Analysis summary">
      <div>
        <h2 className="text-base font-semibold text-ink">
          {analysisLabel(s.testName(batch.assessment_id), batch.trace[0]?.timestamp)}
        </h2>
        <p className="text-xs text-ink-muted">Every mark is a draft until you confirm it.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Students" value={scores.length} hint={`took ${s.testName(batch.assessment_id)}`} />
        <StatTile
          label="Marks lost"
          value={lost}
          hint={`of ${possible} marks on offer`}
        />
        <StatTile
          label="Whole-class problems"
          value={whole.length}
          hint={
            whole.length
              ? `Mistakes made by ${pct(s.sharedThreshold)} or more of the class`
              : "No mistake is shared widely enough"
          }
        />
        <StatTile
          label="Needs your call"
          value={s.openCount}
          tone={s.openCount > 0 ? "flag" : "default"}
          hint={s.openCount > 0 ? "Waiting for you in To review" : "Nothing waiting"}
        />
      </div>

      <NextSteps
        planned={plan ? plan.scheduled.length : 0}
        used={plan?.minutes_used ?? 0}
        budget={plan?.budget_minutes ?? 0}
        open={s.openCount}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="How the class scored"
          subtitle={
            totals.length
              ? `The class average was ${roundOne(mean)} out of ${outOf}.`
              : "No scores to show yet."
          }
        >
          <ScoreDistribution scores={totals} outOf={outOf} />
        </Panel>

        <Panel
          title="Which questions were hard"
          subtitle={
            hardest
              ? `Question ${hardest.number} was the hardest: ${hardest.correct} of ${hardest.total} got it right.`
              : "No marked questions yet."
          }
        >
          <QuestionBars rows={questions} />
        </Panel>

        <PatternPanel patterns={patterns} threshold={s.sharedThreshold} />

        {plan && (
          <Panel
            title="Your follow-up time"
            subtitle={
              droppedMinutes(plan) > 0
                ? `${plan.minutes_used} of ${plan.budget_minutes} minutes planned. The rest did not fit.`
                : `${plan.minutes_used} of ${plan.budget_minutes} minutes planned.`
            }
          >
            <TimeBudgetDonut
              used={plan.minutes_used}
              budget={plan.budget_minutes}
              dropped={droppedMinutes(plan)}
            />
          </Panel>
        )}
      </div>
    </section>
  );
}

function PatternPanel({
  patterns,
  threshold,
}: {
  patterns: ReturnType<typeof namedPatterns>;
  threshold: number;
}) {
  const { setView } = useAppView();
  const top = patterns[0];
  const shown = patterns.slice(0, TOP_PATTERNS);
  return (
    <Panel
      title="Most common mistakes"
      subtitle={
        top
          ? top.teaching_problem
            ? `${top.count} of ${top.cohort_size} students made the same mistake, so it is a whole-class problem.`
            : "No mistake is shared by enough of the class to be a whole-class problem."
          : "No mistake patterns were found."
      }
      action={
        patterns.length > TOP_PATTERNS ? (
          <button className="btn btn-xs" onClick={() => setView("class")}>
            See all {patterns.length}
          </button>
        ) : undefined
      }
    >
      <PatternBars
        threshold={threshold}
        onSelect={() => setView("class")}
        rows={shown.map((n) => ({
          id: n.node_id,
          label: n.label,
          count: n.count,
          cohortSize: n.cohort_size,
          kind: n.kind,
        }))}
      />
    </Panel>
  );
}

function NextSteps({
  planned,
  used,
  budget,
  open,
}: {
  planned: number;
  used: number;
  budget: number;
  open: number;
}) {
  const { setView } = useAppView();
  return (
    <Panel title="What to do next" flush>
      <ul className="divide-y divide-line">
        <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm text-ink">Look at your action plan</div>
            <div className="text-xs text-ink-muted">
              {plural(planned, "thing")} planned for <span className="num">{used}</span> of{" "}
              <span className="num">{budget}</span> minutes.
            </div>
          </div>
          <button className="btn btn-xs" onClick={() => setView("plan")}>
            Open action plan
          </button>
        </li>
        <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm text-ink">
              Check what needs your call
              {open > 0 && <Tag tone="flag">{open}</Tag>}
            </div>
            <div className="text-xs text-ink-muted">
              {open > 0
                ? `${plural(open, "answer")} the system was not sure enough to decide alone.`
                : "The system decided everything it was sure about."}
            </div>
          </div>
          <button className="btn btn-xs" onClick={() => setView("review")}>
            Open To review
          </button>
        </li>
      </ul>
    </Panel>
  );
}
