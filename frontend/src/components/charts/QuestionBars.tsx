import { pct } from "../../lib/format";

/** The share of students who got each question right. Placeholder. */
export function QuestionBars({
  rows,
}: {
  rows: { number: number; label: string; correct: number; total: number }[];
}) {
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => {
        const share = r.total ? r.correct / r.total : 0;
        return (
          <li key={r.number} className="flex items-center gap-3 text-xs">
            <span className="w-40 shrink-0 truncate text-ink-muted" title={r.label}>
              {r.label}
            </span>
            <div className="flex-1 h-2 rounded-full bg-surface-sunken border border-line overflow-hidden">
              <div className="h-full bg-ink-faint" style={{ width: `${share * 100}%` }} />
            </div>
            <span className="w-24 shrink-0 text-right num text-ink-muted">
              {r.correct} of {r.total} ({pct(share)})
            </span>
          </li>
        );
      })}
    </ul>
  );
}
