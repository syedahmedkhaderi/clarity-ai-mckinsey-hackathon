import clsx from "clsx";
import type { ReactNode } from "react";

/** One number with a sentence under it. Neutral unless it is handed to the teacher. */
export function StatTile({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "flag";
}) {
  return (
    <div
      className={clsx(
        "rounded-md border px-4 py-3",
        tone === "flag" ? "border-flag-line bg-flag-soft" : "border-line bg-surface",
      )}
    >
      <div className="text-2xs font-medium uppercase tracking-wide text-ink-faint">{label}</div>
      <div className={clsx("num mt-1 text-2xl", tone === "flag" ? "text-flag" : "text-ink")}>
        {value}
      </div>
      {hint !== undefined && <div className="mt-1 text-xs text-ink-muted">{hint}</div>}
    </div>
  );
}
