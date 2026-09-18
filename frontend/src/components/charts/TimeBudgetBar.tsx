const minutes = (n: number) => `${n} ${n === 1 ? "minute" : "minutes"}`;

/**
 * Minutes planned against the time available, with the work that did not fit
 * shown beyond the end of the time. Segments are separated by a gap of the
 * background colour rather than an outline.
 */
export function TimeBudgetBar({
  used,
  budget,
  dropped,
}: {
  used: number;
  budget: number;
  dropped: number;
}) {
  const planned = Math.max(0, used);
  const free = Math.max(0, budget - planned);
  const left = Math.max(0, dropped);
  const whole = planned + free + left || 1;
  const width = (n: number) => `${(n / whole) * 100}%`;

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-4 text-xs">
        <span className="text-ink-muted">
          <span className="num font-medium text-ink">{used}</span> of{" "}
          <span className="num">{budget}</span> minutes planned
        </span>
        <span className="text-ink-faint">
          <span className="num">{dropped}</span> minutes of work did not fit
        </span>
      </div>
      <div
        role="img"
        aria-label={`${minutes(planned)} planned, ${minutes(free)} free, ${minutes(left)} of work did not fit`}
        className="flex h-3 gap-0.5"
      >
        {planned > 0 && (
          <div className="rounded-[4px] bg-agent" style={{ width: width(planned) }} title="Planned" />
        )}
        {free > 0 && (
          <div className="rounded-[4px] bg-line" style={{ width: width(free) }} title="Free" />
        )}
        {left > 0 && (
          <div
            className="rounded-[4px] bg-ink-faint"
            style={{ width: width(left) }}
            title="Did not fit"
          />
        )}
      </div>
    </div>
  );
}
