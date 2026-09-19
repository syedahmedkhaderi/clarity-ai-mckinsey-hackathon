import { Tip } from "./Tip";

const TARGET_BINS = 6;

interface Bin {
  from: number;
  to: number;
  count: number;
}

function buildBins(scores: number[], outOf: number): { bins: Bin[]; width: number } {
  const top = Math.max(1, Math.floor(outOf));
  const width = Math.max(1, Math.ceil((top + 1) / TARGET_BINS));
  const count = Math.ceil((top + 1) / width);
  const bins: Bin[] = Array.from({ length: count }, (_, i) => ({
    from: i * width,
    to: Math.min(top, i * width + width - 1),
    count: 0,
  }));
  for (const score of scores) {
    const at = Math.min(count - 1, Math.max(0, Math.floor(score / width + 1e-9)));
    bins[at].count += 1;
  }
  return { bins, width };
}

const range = (b: Bin) => (b.from === b.to ? `${b.from}` : `${b.from} to ${b.to}`);
const students = (n: number) => `${n} ${n === 1 ? "student" : "students"}`;

/**
 * How many students landed in each band of marks, with the class average marked.
 * Grouped into about six bands so a class of twelve still shows a shape rather
 * than a comb of ones and zeros.
 */
export function ScoreDistribution({ scores, outOf }: { scores: number[]; outOf: number }) {
  if (scores.length === 0) {
    return <p className="text-sm text-ink-muted">No scores yet.</p>;
  }
  const { bins, width } = buildBins(scores, outOf);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const tallest = Math.max(...bins.map((b) => b.count));
  const top = Math.max(2, 2 * Math.ceil(tallest / 2));
  const ticks = [0, top / 2, top];
  // Bands are drawn as equal columns, so a score sits at its share of the whole axis.
  const meanAt = Math.min(1, Math.max(0, (mean + 0.5) / (bins.length * width)));
  const labelAt = Math.min(85, Math.max(15, meanAt * 100));
  const meanText = Number.isInteger(mean) ? `${mean}` : mean.toFixed(1);

  return (
    <div role="group" aria-label={`Scores out of ${outOf}. Class average ${meanText}.`}>
      <div className="flex gap-2">
        <div className="relative mt-6 h-32 w-6 shrink-0" aria-hidden>
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 num text-ink-faint translate-y-1/2"
              style={{ bottom: `${(t / top) * 100}%` }}
            >
              {t}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative mt-6 h-32">
            {ticks.map((t) => (
              <span
                key={t}
                aria-hidden
                className="absolute inset-x-0 border-t border-line"
                style={{ bottom: `${(t / top) * 100}%` }}
              />
            ))}

            <div className="absolute inset-0 flex">
              {bins.map((b) => (
                <div key={b.from} className="flex-1 px-1">
                  <Tip
                    className="relative flex h-full w-full items-end justify-center"
                    text={`${students(b.count)} scored ${range(b)} out of ${outOf}`}
                  >
                    <span
                      className="relative block w-full max-w-10 rounded-t-[4px] bg-chart transition-colors group-hover:bg-chart-line group-focus:bg-chart-line"
                      style={{ height: `${(b.count / top) * 100}%` }}
                    >
                      <span className="absolute bottom-full left-0 right-0 mb-0.5 text-center num text-ink">
                        {b.count}
                      </span>
                    </span>
                  </Tip>
                </div>
              ))}
            </div>

            <span
              aria-hidden
              className="absolute -top-1 bottom-0 w-0.5 bg-chart-hot"
              style={{ left: `${meanAt * 100}%` }}
            />
            <span
              aria-hidden
              className="absolute -top-6 -translate-x-1/2 whitespace-nowrap text-2xs font-medium text-chart-hot"
              style={{ left: `${labelAt}%` }}
            >
              Class average {meanText}
            </span>
          </div>

          <div className="flex" aria-hidden>
            {bins.map((b) => (
              <span key={b.from} className="flex-1 pt-1 text-center num text-ink-faint">
                {b.from === b.to ? b.from : `${b.from}-${b.to}`}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-1 pl-8 text-center text-2xs text-ink-faint">
        Marks scored, out of {outOf}. The left edge shows the number of students.
      </p>
    </div>
  );
}
