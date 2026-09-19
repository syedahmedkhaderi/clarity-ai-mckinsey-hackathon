import clsx from "clsx";
import { useState } from "react";
import { PATTERN_KIND_LABELS, pct } from "../../lib/format";
import type { PatternKind } from "../../types";
import { Tag } from "../ui/Tag";

const GRID = "grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,19rem)_minmax(0,1fr)_4.5rem] gap-x-3";

/**
 * How many students made each mistake, out of the whole class. The full width of
 * a bar is every student, and the vertical line is where a mistake stops being
 * a set of individual problems and becomes a gap in the teaching. With
 * `collapseAfter`, only the biggest few show until the teacher asks for the rest.
 */
export function PatternBars({
  rows,
  threshold,
  onSelect,
  collapseAfter,
}: {
  rows: { id: string; label: string; count: number; cohortSize: number; kind: PatternKind }[];
  threshold: number;
  onSelect?: (id: string) => void;
  collapseAfter?: number;
}) {
  const [all, setAll] = useState(false);
  if (rows.length === 0) {
    return <p className="text-sm text-ink-muted">No mistake patterns were found in this test.</p>;
  }
  const size = Math.max(1, ...rows.map((r) => r.cohortSize));
  const sorted = [...rows].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const line = Math.min(1, Math.max(0, threshold));
  const lineStudents = Math.ceil(line * size - 1e-9);
  const extra = collapseAfter !== undefined ? Math.max(0, sorted.length - collapseAfter) : 0;
  const shown = extra > 0 && !all ? sorted.slice(0, collapseAfter) : sorted;

  return (
    <div>
      {/* Only the line is named up here; the ends of the scale are in the key below, so
          nothing collides when the line sits near an end on a narrow screen. */}
      <div className={clsx(GRID, "hidden sm:grid")} aria-hidden>
        <span />
        <div className="relative h-5 text-2xs">
          <span
            className="absolute top-0 whitespace-nowrap font-medium text-ink"
            style={
              line > 0.5
                ? { right: `${(1 - line) * 100}%`, paddingRight: 4 }
                : { left: `${line * 100}%`, paddingLeft: 4 }
            }
          >
            Whole-class line
          </span>
        </div>
        <span />
      </div>

      <ul aria-label="Students who made each mistake">
        {shown.map((r, i) => {
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
                )}
                {r.kind !== "emerging" && (
                  <>
                    {" "}
                    <Tag tone={r.kind === "shared" ? "agent" : "neutral"} className="align-middle">
                      {PATTERN_KIND_LABELS[r.kind]}
                    </Tag>
                  </>
                )}
              </div>

              <div className="order-3 col-span-2 pb-2 sm:order-none sm:col-span-1 sm:pb-0">
                <div className="relative flex h-full items-center sm:py-2">
                  <div
                    role="img"
                    aria-label={`${r.count} of ${r.cohortSize} students, ${pct(share)}`}
                    className="h-3 w-full rounded-full bg-chart-track"
                  >
                    <div
                      className={clsx(
                        "anim-grow-x h-full rounded-full",
                        whole ? "bg-chart-hot" : "bg-chart",
                      )}
                      style={{
                        width: `${Math.min(1, r.count / size) * 100}%`,
                        animationDelay: `${(collapseAfter !== undefined && i >= collapseAfter ? i - collapseAfter : i) * 90}ms`,
                      }}
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
                <span
                  className="anim-fade num text-ink"
                  style={{ animationDelay: `${300 + i * 90}ms` }}
                >
                  {r.count} of {r.cohortSize}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {extra > 0 && (
        <button type="button" className="btn btn-xs mt-2" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? `Show only the top ${collapseAfter}` : `Show ${extra} more`}
        </button>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-2xs text-ink-faint">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-[2px] bg-chart-hot" />
          At or past the line
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-[2px] bg-chart" />
          Below the line
        </span>
        <span>
          A full bar is all {size} students. The line is {lineStudents} of {size} ({pct(line)}).
        </span>
      </div>
    </div>
  );
}
