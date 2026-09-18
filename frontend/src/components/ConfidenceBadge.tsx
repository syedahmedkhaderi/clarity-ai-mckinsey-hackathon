import clsx from "clsx";

/**
 * Confidence is always shown as a number. A bare colour would invite the
 * question "what does amber mean", and there would be no good answer.
 */
export function ConfidenceBadge({
  value,
  floor,
  label = "conf",
}: {
  value: number;
  floor?: number;
  label?: string;
}) {
  const below = floor !== undefined && value < floor;
  return (
    <span
      className={clsx(
        "tag num",
        below ? "border-flag-line bg-flag-soft text-flag" : "border-line bg-surface-sunken text-ink-muted",
      )}
      title={
        below
          ? `Below the ${floor?.toFixed(2)} threshold, so this item was sent to a human`
          : "Agent confidence, 0.00 to 1.00"
      }
    >
      {label} {value.toFixed(2)}
    </span>
  );
}
