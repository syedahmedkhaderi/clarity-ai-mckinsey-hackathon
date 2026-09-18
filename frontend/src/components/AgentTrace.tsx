import clsx from "clsx";
import { useMemo } from "react";
import type { TraceEvent } from "../types";
import { useSession } from "../hooks/useSession";
import { AGENT_LABELS, REASON_LABELS, shortTime } from "../lib/format";
import type { ReasonCode } from "../types";

const PIPELINE = ["intake", "marker", "diagnostician", "cohort_analyst", "planner"];

/** What each step is actually doing, in words a teacher would use. */
const STAGE_BLURB: Record<string, string> = {
  intake: "Reading the class's answers and pulling each student's earlier results",
  marker: "Marking every answer against the scheme, as a draft",
  diagnostician: "Finding the mistake pattern behind each lost mark, quoting the student's own words",
  cohort_analyst: "Working out which mistakes belong to one student and which to the whole class",
  planner: "Deciding how to spend your time, and what it has to leave out",
};

/** Reason codes are shown as their plain label; anything else is left as it is. */
const actionLabel = (action: string) => REASON_LABELS[action as ReasonCode] ?? action;

/** Which reason codes each gated node can raise, mirroring agents/reviewer.py. */
const GATE_CODES: Record<string, string[]> = {
  marker: ["LOW_MARK_CONFIDENCE", "COUNTS_TOWARD_RECORD"],
  diagnostician: ["AMBIGUOUS_DIAGNOSIS", "LANGUAGE_BARRIER"],
  planner: ["BUDGET_OVERFLOW"],
};

type Status = "waiting" | "running" | "done";

/**
 * The agents as a vertical pipeline. Each stage lights up as its trace events
 * arrive, and the running stage shows its latest line so a long model call reads
 * as work in progress rather than a hang.
 *
 * The reviewer gate is drawn as a branch off the main line because that is what
 * it is in the code: a gate called at the end of three nodes, not a node itself.
 */
export function AgentTrace({
  events,
  status,
  elapsedMs,
}: {
  events: TraceEvent[];
  status: string;
  elapsedMs: number;
}) {
  const { plain } = useSession();
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

  const running = status === "running";
  const doneCount = PIPELINE.filter((a) => stageStatus(a) === "done").length;
  const current = PIPELINE.find((a) => stageStatus(a) === "running");

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="min-w-0">
          <div className="panel-title">Steps</div>
          <div className="panel-sub">
            The safety check runs after marking, finding mistakes and planning.
          </div>
        </div>
        <span
          className={clsx(
            "tag shrink-0",
            running
              ? "border-agent-line bg-agent-soft text-agent"
              : status === "failed"
                ? "border-flag-line bg-flag-soft text-flag"
                : status === "complete"
                  ? "border-line bg-surface-sunken text-ink-muted"
                  : "border-line bg-surface-sunken text-ink-faint",
          )}
        >
          {running ? `${doneCount} of ${PIPELINE.length} done` : status}
        </span>
      </div>

      {(running || doneCount > 0) && (
        <div className="px-4 pt-3">
          <div className="flex items-baseline justify-between text-xs mb-1.5">
            <span className="text-ink-muted">
              {running && current
                ? STAGE_BLURB[current]
                : status === "complete"
                  ? "Finished. Every mark is a draft until you confirm it."
                  : "Stopped early. Everything completed before that point is kept."}
            </span>
            <span className="num text-ink-faint shrink-0 ml-3">
              {(elapsedMs / 1000).toFixed(1)}s
            </span>
          </div>
          <div className="h-1 rounded-full bg-surface-sunken border border-line overflow-hidden">
            <div
              className={clsx("h-full transition-all duration-500", running ? "bg-agent" : "bg-line-strong")}
              style={{ width: `${(doneCount / PIPELINE.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="p-4">
        <ol className="relative space-y-3">
          {PIPELINE.map((agent, i) => {
            const list = byAgent[agent] || [];
            const st = stageStatus(agent);
            const end = list.find((e) => e.action === "end");
            const latest = list[list.length - 1];
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
                  {end ? (
                    <span className="num text-ink-faint shrink-0">
                      {(end.duration_ms / 1000).toFixed(1)}s
                    </span>
                  ) : st === "running" ? (
                    <span className="text-2xs text-agent shrink-0">working</span>
                  ) : null}
                </div>

                {st === "waiting" && (
                  <div className="mt-0.5 text-xs text-ink-faint">{STAGE_BLURB[agent]}</div>
                )}
                {st === "running" && latest && (
                  <div className="mt-0.5 text-xs text-ink-muted">{plain(latest.detail)}</div>
                )}
                {st === "done" &&
                  list
                    .filter((e) => e.action !== "start" && e.action !== "progress")
                    .map((e, k) => (
                      <div key={k} className="mt-1 text-xs text-ink-muted leading-relaxed">
                        <span
                          className={clsx(
                            "num mr-1.5",
                            e.level === "warning" ? "text-flag" : "text-ink-faint",
                          )}
                        >
                          {actionLabel(e.action)}
                        </span>
                        {plain(e.detail)}
                      </div>
                    ))}
                {gated && st === "done" && (
                  <GateBranch agent={agent} events={byAgent["reviewer"] || []} plain={plain} />
                )}
              </li>
            );
          })}
        </ol>

        {events.length === 0 && status !== "running" && (
          <p className="text-sm text-ink-faint">
            Nothing has run yet. Start an analysis to watch the steps happen.
          </p>
        )}
        {events.length === 0 && status === "running" && (
          <p className="text-sm text-ink-muted">Starting the run.</p>
        )}
      </div>
    </div>
  );
}

function GateBranch({
  agent,
  events,
  plain,
}: {
  agent: string;
  events: TraceEvent[];
  plain: (text: string | null | undefined) => string;
}) {
  const codes = GATE_CODES[agent] ?? [];
  const relevant = events.filter((e) => codes.includes(e.action));
  if (!relevant.length) return null;
  return (
    <div className="mt-1.5 ml-1 border-l-2 border-dashed border-flag-line pl-3">
      <div className="text-2xs font-medium uppercase tracking-wide text-flag">
        Safety check, {relevant.length} handed to you
      </div>
      {relevant.slice(0, 3).map((e, i) => {
        const detail = plain(e.detail);
        return (
          <div key={i} className="text-xs text-ink-muted">
            <span className="text-flag">{actionLabel(e.action)}</span>{" "}
            {detail.length > 110 ? `${detail.slice(0, 110)}...` : detail}
          </div>
        );
      })}
      {relevant.length > 3 && (
        <div className="text-2xs text-ink-faint">
          and {relevant.length - 3} more in To review
        </div>
      )}
    </div>
  );
}

export function TraceLog({ events }: { events: TraceEvent[] }) {
  const { plain } = useSession();
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">Full activity log</div>
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
                    {actionLabel(e.action)}
                  </span>
                </td>
                <td className="text-xs text-ink-muted">{plain(e.detail)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
