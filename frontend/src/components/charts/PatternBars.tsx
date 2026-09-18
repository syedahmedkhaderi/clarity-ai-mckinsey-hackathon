import { PATTERN_KIND_LABELS, pct } from "../../lib/format";
import type { PatternKind } from "../../types";

/** How much of the class shows each mistake pattern, with the whole-class line. Placeholder. */
export function PatternBars({
  rows,
  threshold,
  onSelect,
}: {
  rows: { id: string; label: string; count: number; cohortSize: number; kind: PatternKind }[];
  threshold: number;
  onSelect?: (id: string) => void;
}) {
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => {
        const share = r.cohortSize ? r.count / r.cohortSize : 0;
        return (
          <li key={r.id} className="flex items-center gap-3 text-xs">
            <button
              type="button"
              disabled={!onSelect}
              onClick={() => onSelect?.(r.id)}
              className="w-56 shrink-0 truncate text-left text-ink hover:underline disabled:no-underline"
              title={r.label}
            >
              {r.label}
            </button>
            <div className="relative flex-1 h-2 rounded-full bg-surface-sunken border border-line">
              <div
                className="h-full rounded-full bg-agent"
                style={{ width: `${Math.min(1, share) * 100}%` }}
              />
              <span
                className="absolute -top-1 -bottom-1 w-px bg-ink-faint"
                style={{ left: `${threshold * 100}%` }}
                title={`Whole-class line, ${pct(threshold)}`}
              />
            </div>
            <span className="w-20 shrink-0 text-right num text-ink-muted">
              {r.count} of {r.cohortSize}
            </span>
            <span className="w-32 shrink-0 text-2xs text-ink-faint">{PATTERN_KIND_LABELS[r.kind]}</span>
          </li>
        );
      })}
    </ul>
  );
}
