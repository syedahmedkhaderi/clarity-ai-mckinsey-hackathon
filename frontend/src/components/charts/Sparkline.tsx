import { Tip } from "./Tip";

interface Point {
  label: string;
  value: number;
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const plain = (v: number) => (Number.isInteger(v) ? `${v}` : v.toFixed(1));

/**
 * Scores across tests, oldest first. The small form sits in a table cell with the
 * latest score written beside it. The large form is for a page of its own: axes,
 * a label under each test and a number on each point.
 */
export function Sparkline({
  points,
  outOf,
  size = "small",
  format = plain,
}: {
  points: Point[];
  outOf: number;
  size?: "small" | "large";
  /** How a value is written, for a chart of percentages or averages. */
  format?: (value: number) => string;
}) {
  if (points.length === 0) return <span className="text-ink-faint">No tests yet</span>;
  return size === "large" ? (
    <Trend points={points} outOf={outOf} format={format} />
  ) : (
    <Small points={points} outOf={outOf} format={format} />
  );
}

function Small({
  points,
  outOf,
  format,
}: {
  points: Point[];
  outOf: number;
  format: (v: number) => string;
}) {
  const width = 88;
  const height = 24;
  const pad = 4;
  const step = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const x = (i: number) => (points.length > 1 ? pad + i * step : width / 2);
  const y = (v: number) => pad + (1 - (outOf ? clamp(v / outOf) : 0)) * (height - pad * 2);
  const last = points[points.length - 1];
  const summary = points.map((p) => `${p.label}: ${format(p.value)}`).join(", ");
  return (
    <span className="inline-flex items-center gap-2" role="img" aria-label={summary} title={summary}>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-6 w-[88px]" aria-hidden>
        {points.length > 1 && (
          <path
            d={points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ")}
            fill="none"
            pathLength={1}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="anim-draw stroke-chart-line"
          />
        )}
        <circle
          cx={x(points.length - 1)}
          cy={y(last.value)}
          r="3.5"
          strokeWidth="2"
          className="anim-pop fill-chart-hot stroke-surface"
          style={{ transformBox: "fill-box", transformOrigin: "center", animationDelay: "900ms" }}
        />
      </svg>
      <span className="num text-ink">{format(last.value)}</span>
    </span>
  );
}

function Trend({
  points,
  outOf,
  format,
}: {
  points: Point[];
  outOf: number;
  format: (v: number) => string;
}) {
  const n = points.length;
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const y = (v: number) => (1 - (outOf ? clamp(v / outOf) : 0)) * 100;
  const ticks = [0, outOf / 2, outOf];
  return (
    <div>
      <div className="flex gap-2">
        <div className="relative mt-6 h-40 w-8 shrink-0" aria-hidden>
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 num text-ink-faint translate-y-1/2"
              style={{ bottom: `${outOf ? (t / outOf) * 100 : 0}%` }}
            >
              {format(t)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative mt-6 h-40">
            {ticks.map((t) => (
              <span
                key={t}
                aria-hidden
                className="absolute inset-x-0 border-t border-line"
                style={{ bottom: `${outOf ? (t / outOf) * 100 : 0}%` }}
              />
            ))}
            {n > 1 && (
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 h-full w-full overflow-visible"
                aria-hidden
              >
                <path
                  d={points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ")}
                  fill="none"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  pathLength={1}
                  className="anim-draw stroke-chart-line"
                />
              </svg>
            )}
            {points.map((p, i) => (
              <Tip
                key={`${p.label}-${i}`}
                text={`${p.label}: ${format(p.value)}`}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${x(i)}%`, top: `${y(p.value)}%` }}
              >
                <span
                  className={
                    "anim-pop block h-3 w-3 rounded-full border-2 border-surface " +
                    (i === n - 1 ? "bg-chart-hot" : "bg-chart-line")
                  }
                  style={{ animationDelay: `${(i / Math.max(1, n - 1)) * 900}ms` }}
                />
                <span
                  aria-hidden
                  style={{ animationDelay: `${(i / Math.max(1, n - 1)) * 900 + 150}ms` }}
                  className={
                    "anim-fade absolute bottom-full left-1/2 mb-1 -translate-x-1/2 num group-hover:hidden group-focus:hidden " +
                    (i === n - 1 ? "font-medium text-chart-hot" : "text-ink")
                  }
                >
                  {format(p.value)}
                </span>
              </Tip>
            ))}
          </div>
          <div className="flex" aria-hidden>
            {points.map((p, i) => (
              <span
                key={`${p.label}-${i}`}
                className="min-w-0 flex-1 truncate px-1 pt-1 text-center text-2xs text-ink-muted"
                title={p.label}
              >
                {p.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
