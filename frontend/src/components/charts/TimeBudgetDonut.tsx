/** The same split as the bar, as a ring. Placeholder. */
export function TimeBudgetDonut({
  used,
  budget,
  dropped,
}: {
  used: number;
  budget: number;
  dropped: number;
}) {
  const r = 40;
  const circumference = 2 * Math.PI * r;
  const share = budget ? Math.min(1, used / budget) : 0;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90" role="img" aria-label="Time planned">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="12" className="stroke-line" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth="12"
          className="stroke-agent"
          strokeDasharray={`${share * circumference} ${circumference}`}
        />
      </svg>
      <div className="text-xs text-ink-muted space-y-0.5">
        <div>
          <span className="num text-ink">{used}</span> of <span className="num">{budget}</span> minutes
          planned
        </div>
        <div>
          <span className="num">{dropped}</span> minutes did not fit
        </div>
      </div>
    </div>
  );
}
