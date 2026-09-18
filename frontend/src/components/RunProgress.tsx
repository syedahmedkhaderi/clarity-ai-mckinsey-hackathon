import clsx from "clsx";
import type { TraceEvent } from "../types";
import { AGENT_LABELS } from "../lib/format";

/** The five graph nodes, then the safety check that follows them. */
const STEPS = ["intake", "marker", "diagnostician", "cohort_analyst", "planner", "reviewer"];

type State = "waiting" | "running" | "done";

function stepStates(trace: TraceEvent[], status: string): Record<string, State> {
  const ended = new Set(trace.filter((e) => e.action === "end").map((e) => e.agent));
  const states: Record<string, State> = {};
  for (const agent of STEPS) {
    const done = agent === "reviewer" ? status === "complete" : ended.has(agent);
    states[agent] = done ? "done" : "waiting";
  }
  // The first step not yet finished is the one in flight.
  const next = STEPS.find((a) => states[a] === "waiting");
  if (next && status === "running") states[next] = "running";
  return states;
}

/**
 * A friendly progress line while the analysis runs: one segment per step, in
 * the teacher's words, lit as each step finishes.
 */
const STALL_MS = 45000;

export function RunProgress({
  trace,
  status,
  elapsedMs,
  stalledMs = 0,
  onCancel,
}: {
  trace: TraceEvent[];
  status: string;
  elapsedMs: number;
  /** Time since the last trace event arrived. A long stall may mean a stuck run. */
  stalledMs?: number;
  onCancel?: () => void;
}) {
  const states = stepStates(trace, status);
  const now = STEPS.find((a) => states[a] === "running");
  const done = STEPS.filter((a) => states[a] === "done").length;
  const stalled = stalledMs > STALL_MS;
  return (
    <div className="panel px-4 py-3" role="status" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <p className="text-sm text-ink">
          {now ? `Working on it. Now: ${AGENT_LABELS[now]}.` : "Working on it."}
        </p>
        <div className="flex items-center gap-3">
          <span className={clsx("text-xs", stalled ? "text-flag" : "text-ink-faint")}>
            <span className="num">{Math.round(elapsedMs / 1000)}s</span> so far, usually about
            20s.
          </span>
          {stalled && onCancel && (
            <button className="btn btn-xs" onClick={onCancel}>
              Stop waiting
            </button>
          )}
        </div>
      </div>
      {stalled && (
        <p className="mt-1.5 text-xs text-flag">
          This is taking longer than usual. You can keep waiting or stop and try again.
        </p>
      )}
      <ol className="mt-3 grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-6" aria-label={`${done} of ${STEPS.length} steps done`}>
        {STEPS.map((agent) => (
          <li key={agent}>
            <div
              className={clsx(
                "h-1.5 rounded-full",
                states[agent] === "done" && "bg-agent",
                states[agent] === "running" && "animate-pulse bg-agent-line",
                states[agent] === "waiting" && "bg-line",
              )}
            />
            <div
              className={clsx(
                "mt-1.5 text-2xs",
                states[agent] === "waiting" ? "text-ink-faint" : "text-ink",
                states[agent] === "running" && "font-medium",
              )}
            >
              {AGENT_LABELS[agent]}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
