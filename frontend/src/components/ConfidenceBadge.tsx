import clsx from "clsx";
import { pct, sure } from "../lib/format";

/**
 * Confidence is always shown as a number. A bare colour would invite the
 * question "what does amber mean", and there would be no good answer.
 */
export function ConfidenceBadge({ value, floor }: { value: number; floor?: number }) {
  const below = floor !== undefined && value < floor;
  return (
    <span
      className={clsx(
        "tag num",
        below ? "border-flag-line bg-flag-soft text-flag" : "border-line bg-surface-sunken text-ink-muted",
      )}
      title={
        below
          ? `Below the ${pct(floor)} the system needs, so this was handed to you`
          : "How sure the system is about this reading"
      }
    >
      {sure(value)}
    </span>
  );
}
