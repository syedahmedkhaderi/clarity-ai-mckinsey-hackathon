import clsx from "clsx";
import type { ReactNode } from "react";

const TONES = {
  neutral: "border-line bg-surface-sunken text-ink-muted",
  agent: "border-agent-line bg-agent-soft text-agent",
  flag: "border-flag bg-surface text-flag font-semibold uppercase tracking-wider",
  // The caller supplies every colour, as the action plan's priority tags do.
  custom: "",
} as const;

/**
 * `agent` marks a finding by the system, `flag` marks something handed to the
 * teacher. The flag is an outline: solid rust is kept for the places where the
 * teacher acts, so a page with several flags does not shout.
 */
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
