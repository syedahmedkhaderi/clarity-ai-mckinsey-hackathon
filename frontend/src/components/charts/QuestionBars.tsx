import { useState } from "react";
import { pct } from "../../lib/format";

/** Below this share the bar is drawn darker, and the legend says so in words. */
const HARD_BELOW = 0.5;

/**
 * The share of students who got each question fully right. Bars share one scale
 * from nobody to everybody, so a short bar is a hard question at a glance. With
 * `collapseAfter`, the hardest few show first and the rest wait behind a toggle.
 */
export function QuestionBars({
  rows,
  collapseAfter,
}: {
  rows: { number: number; label: string; correct: number; total: number }[];
  collapseAfter?: number;
}) {
  const [all, setAll] = useState(false);
  if (rows.length === 0) return <p className="text-sm text-ink-muted">No questions to show yet.</p>;
  const rightShare = (r: { correct: number; total: number }) => (r.total ? r.correct / r.total : 0);
  const extra = collapseAfter !== undefined ? Math.max(0, rows.length - collapseAfter) : 0;
  // Folded, the list is the hardest questions; opened, it goes back to question order.
  const shown =
    extra > 0 && !all
      ? [...rows].sort((a, b) => rightShare(a) - rightShare(b) || a.number - b.number).slice(0, collapseAfter)
      : rows;
  return (
    <div>
      <ul className="space-y-2.5" aria-label="Share of students who got each question right">
        {shown.map((r) => {
          const share = r.total ? r.correct / r.total : 0;
          const hard = share < HARD_BELOW;
          return (
            <li key={r.number} className="flex items-center gap-3">
              <span className="w-6 shrink-0 text-right num font-medium text-ink">Q{r.number}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs text-ink-muted" title={r.label}>
                  {r.label}
                </div>
                <div
                  role="img"
                  aria-label={`Question ${r.number}, ${r.label}: ${r.correct} of ${r.total} students got it right, ${pct(share)}`}
                  className="relative mt-0.5 h-3 rounded-full bg-chart-track"
                >
                  <div
                    className={
                      hard
                        ? "h-full rounded-full bg-chart-hot"
                        : "h-full rounded-full bg-chart"
                    }
                    style={{ width: `${share * 100}%` }}
                  />
                  <span
                    aria-hidden
                    className="absolute -bottom-0.5 -top-0.5 w-px bg-line-strong"
                    style={{ left: `${HARD_BELOW * 100}%` }}
                  />
                </div>
              </div>
              <span className="w-[4.5rem] shrink-0 text-right">
                <span className="num text-ink">
                  {r.correct} of {r.total}
                </span>
                <span className="block text-2xs text-ink-faint">{pct(share)}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {extra > 0 && (
        <button type="button" className="btn btn-xs mt-3" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? `Show only the ${collapseAfter} hardest` : `Show all ${rows.length} questions`}
        </button>
      )}
      <p className="mt-3 text-2xs text-ink-faint">
        Magenta bars: fewer than half the students got the question right. The thin line marks half.
      </p>
    </div>
  );
}
