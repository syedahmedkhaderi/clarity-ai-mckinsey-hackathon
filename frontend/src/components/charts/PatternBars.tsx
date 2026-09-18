import clsx from "clsx";
import { PATTERN_KIND_LABELS, pct } from "../../lib/format";
import type { PatternKind } from "../../types";
import { Tag } from "../ui/Tag";

const GRID = "grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,19rem)_minmax(0,1fr)_4.5rem] gap-x-3";

/**
 * How many students made each mistake, out of the whole class. The full width of
 * a bar is every student, and the vertical line is where a mistake stops being
 * a set of individual problems and becomes a gap in the teaching.
 */
export function PatternBars({
  rows,
  threshold,
  onSelect,
}: {
  rows: { id: string; label: string; count: number; cohortSize: number; kind: PatternKind }[];
  threshold: number;
  onSelect?: (id: string) => void;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-ink-muted">No mistake patterns were found in this test.</p>;
  }
  const size = Math.max(1, ...rows.map((r) => r.cohortSize));
  const sorted = [...rows].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const line = Math.min(1, Math.max(0, threshold));
  const lineStudents = Math.ceil(line * size - 1e-9);

  return (
    <div>
      <div className={clsx(GRID, "hidden sm:grid")} aria-hidden>
        <span />
        <div className="relative h-5 text-2xs text-ink-faint">
          <span className="absolute left-0 top-0 num">0</span>
          <span className="absolute right-0 top-0 num">{size} students</span>
          <span
            className="absolute top-0 -translate-x-1/2 whitespace-nowrap font-medium text-ink"
            style={{ left: `${line * 100}%` }}
          >
            Whole-class line
          </span>
        </div>
        <span />
      </div>

      <ul aria-label="Students who made each mistake">
        {sorted.map((r) => {
          const share = r.cohortSize ? r.count / r.cohortSize : 0;
          const whole = r.kind === "shared" || share >= line;
          return (
            <li key={r.id} className={clsx(GRID, "items-stretch border-t border-line first:border-t-0")}>
              <div className="min-w-0 py-2 text-sm leading-snug text-ink">
                {onSelect ? (
                  <button
                    type="button"
                    onClick={() => onSelect(r.id)}
                    className="text-left hover:underline focus:outline-none focus-visible:underline"
                  >
                    {r.label}
                  </button>
                ) : (
                  r.label
                )}{" "}
                <Tag tone={r.kind === "shared" ? "agent" : "neutral"} className="align-middle">
                  {PATTERN_KIND_LABELS[r.kind]}
                </Tag>
              </div>

              <div className="order-3 col-span-2 pb-2 sm:order-none sm:col-span-1 sm:pb-0">
                <div className="relative flex h-full items-center sm:py-2">
                  <div
                    role="img"
                    aria-label={`${r.count} of ${r.cohortSize} students, ${pct(share)}`}
                    className="h-3 w-full rounded-r-[4px] bg-surface-sunken"
                  >
                    <div
                      className={clsx(
                        "h-full rounded-r-[4px]",
                        whole ? "bg-agent" : "bg-agent-line",
                      )}
                      style={{ width: `${Math.min(1, r.count / size) * 100}%` }}
                    />
                  </div>
                  <span
                    aria-hidden
                    className="absolute inset-y-0 w-px bg-ink"
                    style={{ left: `${line * 100}%` }}
                  />
                </div>
              </div>

              <div className="py-2 text-right">
                <span className="num text-ink">
                  {r.count} of {r.cohortSize}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-2xs text-ink-faint">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-[2px] bg-agent" />
          At or past the line
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-[2px] bg-agent-line" />
          Below the line
        </span>
        <span>
          The line is {lineStudents} of {size} students ({pct(line)}).
        </span>
      </div>
    </div>
  );
}
