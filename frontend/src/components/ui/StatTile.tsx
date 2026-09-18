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
      <div className="text-xs text-ink-muted">{label}</div>
      <div className={clsx("num text-2xl mt-0.5", tone === "flag" ? "text-flag" : "text-ink")}>
        {value}
      </div>
      {hint !== undefined && <div className="text-2xs text-ink-faint mt-0.5">{hint}</div>}
    </div>
  );
}
