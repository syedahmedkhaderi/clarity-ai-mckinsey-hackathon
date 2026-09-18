import clsx from "clsx";
import { useMemo } from "react";
import type { TraceEvent } from "../types";
import { AGENT_LABELS, shortTime } from "../lib/format";

const PIPELINE = ["intake", "marker", "diagnostician", "cohort_analyst", "planner"];

type Status = "waiting" | "running" | "done";

/**
 * The six agents as a vertical pipeline. Each stage lights up as its trace
 * events arrive. The reviewer gate is drawn as a branch off the main line
 * because that is what it is in the code: a gate called at the end of three
 * nodes, not a node of its own.
 */
export function AgentTrace({
  events,
  status,
}: {
  events: TraceEvent[];
  status: string;
}) {
  const byAgent = useMemo(() => {
    const map: Record<string, TraceEvent[]> = {};
    for (const e of events) (map[e.agent] ||= []).push(e);
    return map;
  }, [events]);

  const stageStatus = (agent: string): Status => {
    const list = byAgent[agent] || [];
    if (list.some((e) => e.action === "end")) return "done";
    if (list.length) return "running";
    return "waiting";
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <div className="panel-title">Agent pipeline</div>
          <div className="panel-sub">
            LangGraph state machine. The reviewer gate runs at the end of marker,
            diagnostician and planner.
          </div>
        </div>
        <span
          className={clsx(
            "tag",
            status === "running"
              ? "border-agent-line bg-agent-soft text-agent"
              : status === "failed"
                ? "border-flag-line bg-flag-soft text-flag"
                : "border-line bg-surface-sunken text-ink-muted",
          )}
        >
          {status}
        </span>
      </div>

      <div className="p-4">
        <ol className="relative space-y-3">
          {PIPELINE.map((agent, i) => {
            const list = byAgent[agent] || [];
            const st = stageStatus(agent);
            const end = list.find((e) => e.action === "end");
            const gated = GATE_CODES[agent] !== undefined;
            return (
              <li key={agent} className="relative pl-6">
                {i < PIPELINE.length - 1 && (
                  <span
                    className={clsx(
                      "absolute left-[5px] top-4 h-full w-px",
                      st === "done" ? "bg-agent-line" : "bg-line-strong",
                    )}
                  />
                )}
                <span
                  className={clsx(
                    "absolute left-0 top-[5px] h-[11px] w-[11px] rounded-full border-2 bg-surface",
                    st === "done"
                      ? "border-agent bg-agent"
                      : st === "running"
                        ? "border-agent animate-pulse"
                        : "border-line-strong",
                  )}
                />
                <div className="flex items-baseline justify-between gap-3">
                  <span
                    className={clsx(
                      "text-sm font-medium",
                      st === "waiting" ? "text-ink-faint" : "text-ink",
                    )}
                  >
                    {AGENT_LABELS[agent] ?? agent}
                  </span>
                  {end && <span className="num text-ink-faint">{end.duration_ms} ms</span>}
                </div>
                {list
                  .filter((e) => e.action !== "start")
                  .map((e, k) => (
                    <div key={k} className="mt-1 text-xs text-ink-muted leading-relaxed">
                      <span
                        className={clsx(
                          "num mr-1.5",
                          e.level === "warning" ? "text-flag" : "text-ink-faint",
                        )}
                      >
                        {e.action}
                      </span>
                      {e.detail}
                    </div>
                  ))}
                {gated && st !== "waiting" && (
                  <GateBranch agent={agent} events={byAgent["reviewer"] || []} />
                )}
              </li>
            );
          })}
        </ol>

        {events.length === 0 && (
          <p className="text-sm text-ink-faint">
            No run yet. Start an analysis to watch the agents work.
          </p>
        )}
      </div>
    </div>
  );
}

/** Which reason codes each gated node can raise, mirroring agents/reviewer.py. */
const GATE_CODES: Record<string, string[]> = {
  marker: ["LOW_MARK_CONFIDENCE", "COUNTS_TOWARD_RECORD"],
  diagnostician: ["AMBIGUOUS_DIAGNOSIS", "LANGUAGE_BARRIER"],
  planner: ["BUDGET_OVERFLOW"],
};

function GateBranch({ agent, events }: { agent: string; events: TraceEvent[] }) {
  const codes = GATE_CODES[agent] ?? [];
  const relevant = events.filter((e) => codes.includes(e.action));
  if (!relevant.length) return null;
  return (
    <div className="mt-1.5 ml-1 border-l-2 border-dashed border-flag-line pl-3">
      <div className="text-2xs font-medium uppercase tracking-wide text-flag">
        Reviewer gate, {relevant.length} escalated
      </div>
      {relevant.slice(0, 3).map((e, i) => (
        <div key={i} className="text-xs text-ink-muted">
          <span className="num text-flag">{e.action}</span>{" "}
          {e.detail.length > 110 ? `${e.detail.slice(0, 110)}...` : e.detail}
        </div>
      ))}
      {relevant.length > 3 && (
        <div className="text-2xs text-ink-faint">
          and {relevant.length - 3} more in the escalation queue
        </div>
      )}
    </div>
  );
}

export function TraceLog({ events }: { events: TraceEvent[] }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">Full trace</div>
        <span className="panel-sub">{events.length} events</span>
      </div>
      <div className="max-h-80 overflow-y-auto">
        <table>
          <thead>
            <tr>
              <th className="w-20">Time</th>
              <th className="w-32">Agent</th>
              <th className="w-40">Action</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e, i) => (
              <tr key={i}>
                <td className="num text-ink-faint">{shortTime(e.timestamp)}</td>
                <td className="text-xs text-ink-muted">{AGENT_LABELS[e.agent] ?? e.agent}</td>
                <td>
                  <span
                    className={clsx(
                      "num",
                      e.level === "escalation"
                        ? "text-flag"
                        : e.level === "decision"
                          ? "text-agent"
                          : "text-ink-faint",
                    )}
                  >
                    {e.action}
                  </span>
                </td>
                <td className="text-xs text-ink-muted">{e.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
