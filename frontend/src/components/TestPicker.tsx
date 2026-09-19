import type { Assignment } from "../types";
import { marksLabel } from "../lib/format";

/**
 * Chooses the test and starts the analysis. Lives in the Home rail, so it is a
 * vertical stack. A native select rather than a row of buttons: the list grows
 * every term and a row stops fitting after four.
 */
export function TestPicker({
  assignments,
  selected,
  onSelect,
  onRun,
  running,
  blockedReason,
}: {
  assignments: Assignment[];
  selected: string;
  onSelect: (id: string) => void;
  onRun: () => void;
  running: boolean;
  /** Why the selected test cannot be run, or null when it can. */
  blockedReason: string | null;
}) {
  const current = assignments.find((a) => a.id === selected);
  const yours = assignments.filter((a) => a.source === "uploaded");
  const provided = assignments.filter((a) => a.source !== "uploaded");

  return (
    <div className="flex flex-col gap-3">
        <div className="min-w-0">
          <label
            htmlFor="test-picker"
            className="block text-2xs font-medium uppercase tracking-wide text-ink-muted"
          >
            Analysing
          </label>
          {assignments.length === 0 ? (
            <p className="mt-2 text-sm text-ink-faint">Loading your tests.</p>
          ) : (
            <select
              id="test-picker"
              value={selected}
              disabled={running}
              onChange={(e) => onSelect(e.target.value)}
              className="mt-1.5 w-full rounded border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-ink focus:ring-1 focus:ring-ink disabled:cursor-not-allowed disabled:opacity-60"
            >
              {yours.length > 0 ? (
                <>
                  <optgroup label="Tests you added">
                    {yours.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.display_name ?? a.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Course tests">
                    {provided.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.display_name ?? a.name}
                      </option>
                    ))}
                  </optgroup>
                </>
              ) : (
                provided.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.display_name ?? a.name}
                  </option>
                ))
              )}
            </select>
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
          {blockedReason && <p className="mt-2 text-xs text-flag">{blockedReason}</p>}
        </div>
        <button
          className="btn btn-primary justify-center"
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
  );
}
