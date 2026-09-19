import { Panel } from "../components/ui/Panel";
import { useEffect, useRef, useState } from "react";
import { PatternBars } from "../components/charts/PatternBars";
import { ScoreDistribution } from "../components/charts/ScoreDistribution";
import { useSession } from "../hooks/useSession";
import { pct } from "../lib/format";
import type { BatchResult, NodePattern } from "../types";
import { marksLost, namedPatterns, roundOne, studentScores } from "./classStats";
import { ClassFigures, MistakeDetails, WhoPanel, WholeClass, focusOn, type Focus } from "./HomeClass";

const TOP_PATTERNS = 4;

/** The class in a handful of numbers, for the Home overview and its details. */
export interface HomeStats {
  students: number;
  lost: number;
  possible: number;
  mean: string;
  outOf: number;
  totals: number[];
  patterns: NodePattern[];
  whole: NodePattern[];
}

export function homeStats(batch: BatchResult): HomeStats {
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
    patterns,
    whole: patterns.filter((n) => n.teaching_problem),
  };
}

/**
 * Home's one view, top to bottom: the whole-class problems, how the class
 * scored beside four numbers that say where the problem lies, the most common
 * mistakes, and who made which. Selecting a mistake anywhere opens the students behind it under
 * the heatmap, where a finding can be corrected.
 */
export function OverviewTab({ stats, batch }: { stats: HomeStats; batch: BatchResult }) {
  const [focus, setFocus] = useState<Focus | null>(null);
  const who = useRef<HTMLDivElement>(null);
  const details = useRef<HTMLDivElement>(null);
  const [scrollTo, setScrollTo] = useState<"who" | "details" | null>(null);

  useEffect(() => {
    const target = scrollTo === "who" ? who.current : scrollTo === "details" ? details.current : null;
    target?.scrollIntoView({ behavior: "smooth", block: scrollTo === "who" ? "start" : "nearest" });
    setScrollTo(null);
  }, [scrollTo, focus]);

  const openPattern = (node: string) => {
    setFocus(focusOn(batch, node));
    setScrollTo("who");
  };

  return (
    <div className="space-y-5">
      <WholeClass batch={batch} problems={stats.whole} onSee={openPattern} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel
          title="How did the class score?"
          subtitle={
            stats.totals.length
              ? `The class average was ${stats.mean} out of ${stats.outOf}.`
              : "No scores to show yet."
          }
        >
          <ScoreDistribution scores={stats.totals} outOf={stats.outOf} />
        </Panel>
        <ClassFigures batch={batch} named={stats.patterns} />
      </div>
      <PatternPanel patterns={stats.patterns} onSelect={openPattern} />
      <div ref={who} className="scroll-mt-4">
        <WhoPanel
          batch={batch}
          focus={focus}
          onFocus={(f) => {
            setFocus(f);
            setScrollTo("details");
          }}
        />
      </div>
      <div ref={details}>
        {focus && <MistakeDetails batch={batch} focus={focus} onFocus={setFocus} />}
      </div>
    </div>
  );
}

function PatternPanel({
  patterns,
  onSelect,
}: {
  patterns: NodePattern[];
  onSelect: (node: string) => void;
}) {
  const { sharedThreshold } = useSession();
  const top = patterns[0];
  return (
    <Panel
      title="What are the most common mistakes?"
      subtitle={
        top
          ? top.teaching_problem
            ? `${top.count} of ${top.cohort_size} students made the same mistake, so it is a whole-class problem. Select a mistake to see who made it.`
            : `No mistake is made by ${pct(sharedThreshold)} of the class, so none is a whole-class problem. Select a mistake to see who made it.`
          : "No mistake patterns were found."
      }
    >
      <PatternBars
        threshold={sharedThreshold}
        onSelect={onSelect}
        collapseAfter={TOP_PATTERNS}
        rows={patterns.map((n) => ({
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
