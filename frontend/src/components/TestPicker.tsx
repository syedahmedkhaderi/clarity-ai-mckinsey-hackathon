import type { Assignment } from "../types";
import { shortDate } from "../lib/format";
import { Select, type SelectOption } from "./ui/Select";

/** One menu row per test: the short name, the full name, when it is due and how many sheets are in. */
function option(a: Assignment): SelectOption {
  const short = a.submission_count < a.expected_count;
  const label = a.display_name ?? a.name;
  // "Mid-term - Foundational Mathematics" under the label "Mid-term" repeats itself.
  const rest = a.name.startsWith(label) ? a.name.slice(label.length).replace(/^\s*-\s*/, "") : a.name;
  return {
    value: a.id,
    label,
    detail: rest && rest !== label ? rest : undefined,
    sub: a.due_at ? `Due ${shortDate(a.due_at)}` : undefined,
    meta: `${a.submission_count} of ${a.expected_count} in`,
    metaTone: short ? "flag" : "default",
  };
}

/**
 * Chooses the test and starts the analysis, laid out as one row for the bar
 * across the top of Home. The test's own facts live in Home's details panel. A select rather than a row
 * of buttons: the list grows every term and a row stops fitting after four.
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
    <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
      <div className="w-full min-w-0 sm:w-80">
        {assignments.length === 0 ? (
          <p className="text-sm text-ink-faint">Loading your tests.</p>
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
      {blockedReason && <p className="pb-0.5 text-xs text-flag">{blockedReason}</p>}
    </div>
  );
}
