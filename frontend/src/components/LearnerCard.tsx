import clsx from "clsx";
import type { LearnerContext } from "../types";
import { PATTERN_KIND_LABELS, pct } from "../lib/format";

export function LearnerCard({
  learner,
  errorCount,
  recurringCount,
  selected,
  onClick,
}: {
  learner: LearnerContext;
  errorCount: number;
  recurringCount: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "w-full text-left px-3 py-2 border-l-2 transition-colors",
        selected
          ? "border-agent bg-agent-soft"
          : "border-transparent hover:bg-surface-sunken",
      )}
    >
      <div className="text-sm font-medium text-ink">{learner.learner_name}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
        <span className="text-2xs text-ink-muted">
          {errorCount} {errorCount === 1 ? "mistake" : "mistakes"}
        </span>
        {recurringCount > 0 && (
          <span
            className="tag border-agent-line bg-agent-soft text-agent"
            title={`${recurringCount} ${recurringCount === 1 ? "pattern" : "patterns"}`}
          >
            {PATTERN_KIND_LABELS.recurring}
          </span>
        )}
        {learner.returner && (
          <span
            className={clsx(
              "tag",
              learner.low_confidence_history
                ? "border-flag-line bg-flag-soft text-flag"
                : "border-line bg-surface-sunken text-ink-muted",
            )}
            title={learner.note ?? undefined}
          >
            {pct(learner.history_completeness)} of earlier tests on record
          </span>
        )}
      </div>
    </button>
  );
}
