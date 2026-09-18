import clsx from "clsx";
import { useState } from "react";
import type { Assignment } from "../types";
import { marksLabel } from "../lib/format";

/**
 * Chooses the test and starts the analysis. The time box is the hard limit the
 * planner has to respect, so it sits next to the button rather than in settings.
 */
export function TestPicker({
  assignments,
  selected,
  onSelect,
  minutes,
  onMinutes,
  onRun,
  running,
  blockedReason,
}: {
  assignments: Assignment[];
  selected: string;
  onSelect: (id: string) => void;
  minutes: number;
  onMinutes: (m: number) => void;
  onRun: () => void;
  running: boolean;
  /** Why the selected test cannot be run, or null when it can. */
  blockedReason: string | null;
}) {
  const [touched, setTouched] = useState(false);
  const current = assignments.find((a) => a.id === selected);

  return (
    <div className="panel">
      <div className="p-4">
        <div className="text-xs font-medium text-ink-muted" id="test-picker-label">
          Choose a test
        </div>
        {assignments.length === 0 ? (
          <p className="mt-2 text-sm text-ink-faint">Loading your tests.</p>
        ) : (
          <div role="radiogroup" aria-labelledby="test-picker-label" className="mt-2 flex flex-wrap gap-2">
            {assignments.map((a) => (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={selected === a.id}
                disabled={running}
                onClick={() => onSelect(a.id)}
                className={clsx(
                  "max-w-full truncate rounded-md border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                  selected === a.id
                    ? "border-ink bg-ink font-medium text-white"
                    : "border-line-strong bg-surface text-ink hover:bg-surface-sunken",
                )}
                title={a.display_name ?? a.name}
              >
                {a.display_name ?? a.name}
                {a.source === "uploaded" && (
                  <span className={clsx("ml-1.5 text-2xs", selected === a.id ? "text-white/70" : "text-ink-faint")}>
                    yours
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        {current && (
          <p className="mt-2 text-xs text-ink-muted">
            <span className="num">{current.question_count}</span> questions,{" "}
            <span className="num">{marksLabel(current.points_possible)}</span>,{" "}
            <span className="num">
              {current.submission_count} of {current.expected_count}
            </span>{" "}
            answer sheets in.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-x-5 gap-y-3 border-t border-line bg-surface-raised px-4 py-3">
        <label className="text-xs text-ink-muted">
          <span className="mb-1 block">Time you have for follow-up</span>
          <span className="inline-flex items-center gap-1.5">
            <input
              type="number"
              min={15}
              max={600}
              step={5}
              value={minutes}
              onChange={(e) => {
                setTouched(true);
                onMinutes(Number(e.target.value));
              }}
              className="num w-20 rounded border border-line-strong px-2 py-1.5 text-sm"
            />
            <span className="text-sm text-ink">minutes</span>
          </span>
        </label>
        <p className="min-w-48 max-w-md flex-1 text-xs text-ink-faint">
          The plan uses this time in order of importance. Anything that does not fit is listed.
          {touched && minutes < 60 && (
            <span className="mt-0.5 block text-flag">
              Under an hour, most of the plan will not fit.
            </span>
          )}
          {blockedReason && <span className="mt-0.5 block text-flag">{blockedReason}</span>}
        </p>
        <button
          className="btn btn-primary ml-auto"
          onClick={onRun}
          disabled={running || !selected || blockedReason !== null}
        >
          {running ? (
            <>
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Working
            </>
          ) : (
            "Analyse this test"
          )}
        </button>
      </div>
    </div>
  );
}
