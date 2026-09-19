import type { Assignment } from "../types";
import { marksLabel, shortDate } from "../lib/format";
import { Select, type SelectOption } from "./ui/Select";

/** One menu row per test: the short name, the full name, when it is due and how many sheets are in. */
function option(a: Assignment): SelectOption {
  const short = a.submission_count < a.expected_count;
  return {
    value: a.id,
    label: a.display_name ?? a.name,
    detail: a.display_name && a.display_name !== a.name ? a.name : undefined,
    sub: a.due_at ? `Due ${shortDate(a.due_at)}` : undefined,
    meta: `${a.submission_count} of ${a.expected_count} in`,
    metaTone: short ? "flag" : "default",
  };
}

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
  const yours = assignments.filter((a) => a.source === "uploaded").map(option);
  const provided = assignments.filter((a) => a.source !== "uploaded").map(option);
  const groups =
    yours.length > 0
      ? [
          { label: "Tests you added", options: yours },
          { label: "Course tests", options: provided },
        ]
      : [{ options: provided }];

  return (
    <div className="flex flex-col gap-3">
        <div className="min-w-0">
          {assignments.length === 0 ? (
            <p className="mt-2 text-sm text-ink-faint">Loading your tests.</p>
          ) : (
            <Select
              id="test-picker"
              label="Test"
              value={selected}
              disabled={running}
              onChange={onSelect}
              groups={groups}
            />
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
