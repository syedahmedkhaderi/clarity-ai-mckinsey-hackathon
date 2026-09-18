/** How many students landed on each score. Placeholder: one bar per whole mark. */
export function ScoreDistribution({ scores, outOf }: { scores: number[]; outOf: number }) {
  const bins = Array.from({ length: Math.max(1, Math.floor(outOf)) + 1 }, (_, i) => i);
  const counts = bins.map((b) => scores.filter((s) => Math.round(s) === b).length);
  const tallest = Math.max(1, ...counts);
  return (
    <div>
      <div className="flex items-end gap-1 h-28">
        {counts.map((c, i) => (
          <div key={i} className="flex-1 flex flex-col justify-end h-full" title={`${c} on ${i}`}>
            <div className="bg-ink-faint rounded-t-sm" style={{ height: `${(c / tallest) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="flex gap-1 mt-1">
        {bins.map((b) => (
          <span key={b} className="flex-1 text-center num text-ink-faint text-2xs">
            {b}
          </span>
        ))}
      </div>
      <p className="text-2xs text-ink-faint mt-1">Marks out of {outOf}</p>
    </div>
  );
}
