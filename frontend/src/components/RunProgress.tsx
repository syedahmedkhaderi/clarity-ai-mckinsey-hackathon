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
export function RunProgress({
  trace,
  status,
  elapsedMs,
}: {
  trace: TraceEvent[];
  status: string;
  elapsedMs: number;
}) {
  const states = stepStates(trace, status);
  const now = STEPS.find((a) => states[a] === "running");
  const done = STEPS.filter((a) => states[a] === "done").length;
  return (
    <div className="panel px-4 py-3" role="status" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <p className="text-sm text-ink">
          {now ? `Working on it. Now: ${AGENT_LABELS[now]}.` : "Working on it."}
        </p>
        <span className="text-xs text-ink-faint">
          <span className="num">{Math.round(elapsedMs / 1000)}s</span> so far, usually about 20s.
        </span>
      </div>
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
