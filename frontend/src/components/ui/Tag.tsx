import clsx from "clsx";
import type { ReactNode } from "react";

const TONES = {
  neutral: "border-line bg-surface-sunken text-ink-muted",
  agent: "border-agent-line bg-agent-soft text-agent",
  flag: "border-flag-line bg-flag-soft text-flag",
} as const;

/** `agent` marks a finding by the system, `flag` marks something handed to the teacher. */
export function Tag({
  tone = "neutral",
  title,
  className,
  children,
}: {
  tone?: keyof typeof TONES;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={clsx("tag", TONES[tone], className)} title={title}>
      {children}
    </span>
  );
}
