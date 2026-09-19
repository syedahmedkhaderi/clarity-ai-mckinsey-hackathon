import { Panel } from "../components/ui/Panel";
import { PatternBars } from "../components/charts/PatternBars";
import { QuestionBars } from "../components/charts/QuestionBars";
import { ScoreDistribution } from "../components/charts/ScoreDistribution";
import { useAppView } from "../hooks/useAppView";
import { useSession } from "../hooks/useSession";
import { pct } from "../lib/format";
import type { BatchResult, NodePattern } from "../types";
import {
  marksLost,
  namedPatterns,
  plural,
  questionRows,
  roundOne,
  studentScores,
} from "./classStats";

const TOP_PATTERNS = 4;

/** The class in a handful of numbers, for the Home overview and its details. */
export interface HomeStats {
  students: number;
  lost: number;
  possible: number;
  mean: string;
  outOf: number;
  totals: number[];
  questions: ReturnType<typeof questionRows>;
  patterns: NodePattern[];
  whole: NodePattern[];
}

export function homeStats(batch: BatchResult, topicName: (id: string) => string): HomeStats {
  const scores = studentScores(batch);
  const { lost, possible } = marksLost(scores);
  const totals = scores.map((x) => x.awarded);
  const mean = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
  const patterns = namedPatterns(batch.patterns?.nodes ?? []);
  return {
    students: scores.length,
    lost,
    possible,
    mean: roundOne(mean),
    outOf: Math.max(0, ...scores.map((x) => x.possible)),
    totals,
    questions: questionRows(batch, topicName),
    patterns,
    whole: patterns.filter((n) => n.teaching_problem),
  };
}

/** Home's one view: two pictures and the mistakes that matter most. */
export function OverviewTab({ stats }: { stats: HomeStats }) {
  const hardest = [...stats.questions].sort(
    (a, b) => a.correct / (a.total || 1) - b.correct / (b.total || 1),
  )[0];
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
      <Panel
        title="How the class scored"
        subtitle={
          stats.totals.length
            ? `The class average was ${stats.mean} out of ${stats.outOf}.`
            : "No scores to show yet."
        }
      >
        <ScoreDistribution scores={stats.totals} outOf={stats.outOf} />
      </Panel>
      <Panel
        title="Which questions were hard"
        subtitle={
          hardest
            ? `Question ${hardest.number} was the hardest: ${hardest.correct} of ${hardest.total} got it right.`
            : "No marked questions yet."
        }
      >
        <QuestionBars rows={stats.questions} />
      </Panel>
      <div className="lg:col-span-2">
        <PatternPanel patterns={stats.patterns} limit={TOP_PATTERNS} />
      </div>
    </div>
  );
}

function PatternPanel({ patterns, limit }: { patterns: NodePattern[]; limit?: number }) {
  const { setView } = useAppView();
  const { sharedThreshold } = useSession();
  const top = patterns[0];
  const shown = limit ? patterns.slice(0, limit) : patterns;
  const more = limit !== undefined && patterns.length > limit;
  return (
    <Panel
      title={limit ? "Most common mistakes" : "Every mistake pattern"}
      subtitle={
        top
          ? top.teaching_problem
            ? `${top.count} of ${top.cohort_size} students made the same mistake, so it is a whole-class problem.`
            : `No mistake is made by ${pct(sharedThreshold)} of the class, so none is a whole-class problem.`
          : "No mistake patterns were found."
      }
      action={
        more ? (
          <button className="btn btn-xs" onClick={() => setView("class")}>
            See all {plural(patterns.length, "pattern")} on the Class page
          </button>
        ) : undefined
      }
    >
      <PatternBars
        threshold={sharedThreshold}
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
