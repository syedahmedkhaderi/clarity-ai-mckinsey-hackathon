/** A student's score across tests, oldest first. Placeholder. */
export function Sparkline({
  points,
  outOf,
}: {
  points: { label: string; value: number }[];
  outOf: number;
}) {
  const width = 100;
  const height = 24;
  const step = points.length > 1 ? width / (points.length - 1) : 0;
  const y = (v: number) => height - (outOf ? Math.max(0, Math.min(1, v / outOf)) : 0) * height;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${i * step},${y(p.value)}`).join(" ");
  return (
    <svg viewBox={`-2 -2 ${width + 4} ${height + 4}`} className="h-6 w-24" role="img">
      <title>{points.map((p) => `${p.label}: ${p.value}`).join(", ")}</title>
      <path d={path} fill="none" strokeWidth="1.5" className="stroke-ink-muted" />
      {points.map((p, i) => (
        <circle key={p.label} cx={i * step} cy={y(p.value)} r="1.8" className="fill-ink-muted" />
      ))}
    </svg>
  );
}
