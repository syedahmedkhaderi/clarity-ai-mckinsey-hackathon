/** Minutes planned against the time available. Placeholder for the original bar. */
export function TimeBudgetBar({
  used,
  budget,
  dropped,
}: {
  used: number;
  budget: number;
  dropped: number;
}) {
  const shown = Math.min(used, budget);
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs mb-1.5">
        <span className="text-ink-muted">
          <span className="num text-ink font-medium">{used}</span> of{" "}
          <span className="num">{budget}</span> minutes planned
        </span>
        <span className="text-ink-faint">
          <span className="num">{dropped}</span> minutes of work did not fit
        </span>
      </div>
      <div className="h-2 rounded-full bg-surface-sunken border border-line overflow-hidden flex">
        <div
          className="bg-agent h-full"
          style={{ width: `${budget ? (shown / budget) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}
