import clsx from "clsx";
import type { LearnerContext } from "../types";
import { STUDENT_TAG_LABELS, scoreText } from "../lib/format";
import { Sparkline } from "./charts/Sparkline";
import { Tag } from "./ui/Tag";

export interface LearnerTotal {
  awarded: number;
  outOf: number;
  /** True until the teacher has confirmed every mark for this student. */
  draft: boolean;
}

export interface LearnerTrend {
  points: { label: string; value: number }[];
  outOf: number;
}

/**
 * One student in the list: name, this test's total, a trend line across tests,
 * the main mistake pattern in words, and a few small tags.
 */
export function LearnerCard({
  learner,
  total,
  trend,
  mainPattern,
  keepsHappening,
  needsCall,
  selected,
  onClick,
}: {
  learner: LearnerContext;
  total: LearnerTotal | null;
  trend: LearnerTrend | null;
  mainPattern: string | null;
  keepsHappening: boolean;
  needsCall: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const showTrend = trend !== null && trend.points.length > 1;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={clsx(
        "w-full text-left px-3 py-2.5 border-l-2 border-b border-b-line last:border-b-0",
        "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 transition-colors",
        selected ? "border-l-ink bg-surface-sunken" : "border-l-transparent hover:bg-surface-raised",
      )}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium text-ink truncate">{learner.learner_name}</div>
        <div className="text-xs text-ink-muted truncate" title={mainPattern ?? undefined}>
          {mainPattern ?? "No mistake pattern found"}
        </div>
      </div>

      <div className="text-right">
        {total ? (
          <div className="flex items-baseline justify-end gap-1.5">
            <span className="text-sm text-ink tabular-nums">
              {scoreText(total.awarded)} of {scoreText(total.outOf)}
            </span>
            <span className="text-2xs text-ink-faint">{total.draft ? "Draft" : "Confirmed"}</span>
          </div>
        ) : (
          <span className="text-xs text-ink-faint">No marks</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 min-h-[20px]">
        {keepsHappening && <Tag tone="agent">{STUDENT_TAG_LABELS.keepsHappening}</Tag>}
        {learner.returner && <Tag>{STUDENT_TAG_LABELS.missedEarlier}</Tag>}
        {needsCall && <Tag tone="flag">{STUDENT_TAG_LABELS.needsCall}</Tag>}
      </div>

      <div className="flex justify-end items-center">
        {showTrend ? (
          <Sparkline points={trend.points} outOf={trend.outOf} />
        ) : (
          <span className="text-2xs text-ink-faint">No trend yet</span>
        )}
      </div>
    </button>
  );
}
