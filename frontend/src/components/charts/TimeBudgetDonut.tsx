import clsx from "clsx";

const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = 2;

interface Slice {
  key: string;
  label: string;
  minutes: number;
  stroke: string;
  swatch: string;
}

/**
 * Where the time goes: planned, still free, and work that did not fit. The ring
 * is the sum of the three, so a plan that overflowed shows the overflow as its
 * own slice instead of hiding it. The centre carries the headline number.
 */
export function TimeBudgetDonut({
  used,
  budget,
  dropped,
}: {
  used: number;
  budget: number;
  dropped: number;
}) {
  const planned = Math.max(0, used);
  const slices: Slice[] = [
    { key: "planned", label: "Planned", minutes: planned, stroke: "stroke-agent", swatch: "bg-agent" },
    {
      key: "free",
      label: "Free",
      minutes: Math.max(0, budget - planned),
      stroke: "stroke-line",
      swatch: "bg-line",
    },
    {
      key: "dropped",
      label: "Did not fit",
      minutes: Math.max(0, dropped),
      stroke: "stroke-ink-faint",
      swatch: "bg-ink-faint",
    },
  ];
  const whole = slices.reduce((sum, s) => sum + s.minutes, 0);
  const visible = slices.filter((s) => s.minutes > 0);
  const gap = visible.length > 1 ? GAP : 0;
  let start = 0;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <div
        role="img"
        aria-label={`${planned} of ${budget} minutes planned, ${Math.max(0, dropped)} minutes of work did not fit`}
        className="relative h-32 w-32 shrink-0"
      >
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="12" className="stroke-surface-sunken" />
          {whole > 0 &&
            visible.map((s) => {
              const length = (s.minutes / whole) * CIRCUMFERENCE;
              const shown = Math.max(0.5, length - gap);
              const offset = -start;
              start += length;
              return (
                <circle
                  key={s.key}
                  cx="50"
                  cy="50"
                  r={RADIUS}
                  fill="none"
                  strokeWidth="12"
                  className={s.stroke}
                  strokeDasharray={`${shown} ${CIRCUMFERENCE - shown}`}
                  strokeDashoffset={offset}
                />
              );
            })}
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          <span className="num text-2xl leading-none text-ink">{planned}</span>
          <span className="mt-1 text-2xs text-ink-faint">of {budget} min</span>
        </div>
      </div>

      <ul className="space-y-1.5 text-xs">
        {slices.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className={clsx("h-2.5 w-2.5 shrink-0 rounded-[2px]", s.swatch)} />
            <span className="text-ink-muted">{s.label}</span>
            <span className="num ml-auto pl-4 text-ink">{s.minutes} min</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
