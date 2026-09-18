import { AgentTrace, TraceLog } from "./AgentTrace";
import { Collapsible } from "./ui/Collapsible";
import { AGENT_LABELS } from "../lib/format";
import type { Health, TraceEvent } from "../types";

/**
 * The steps, in order, for anyone who wants to check the work. Closed by default
 * so the page a teacher sees is about the class, not about the machinery.
 */
export function HowWorkedOut({
  events,
  status,
  elapsedMs,
  health,
  running,
  stage,
}: {
  events: TraceEvent[];
  status: string;
  elapsedMs: number;
  health: Health | null;
  running: boolean;
  stage: string | null;
}) {
  return (
    <Collapsible
      title="How this was worked out"
      hint={running ? (stage ?? "Starting") : "The steps, in order, for anyone who wants to check."}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <AgentTrace events={events} status={status} elapsedMs={elapsedMs} />
        <StepOrder health={health} />
      </div>
      {events.length > 0 && <TraceLog events={events} />}
    </Collapsible>
  );
}

function StepOrder({ health }: { health: Health | null }) {
  if (!health) return null;
  const name = (node: string) => AGENT_LABELS[node] ?? node;
  return (
    <div className="panel h-fit">
      <div className="panel-head">
        <div className="panel-title">Order of the steps</div>
      </div>
      <div className="space-y-2 p-4">
        <ol className="space-y-1 text-xs text-ink-muted">
          {health.graph.edges.map(([a, b], i) => (
            <li key={i}>
              {name(a)} to {name(b)}
            </li>
          ))}
        </ol>
        <p className="border-t border-line pt-2 text-2xs text-ink-faint">
          The safety check runs after{" "}
          {health.graph.reviewer_gated.map((n) => name(n).toLowerCase()).join(", ")}. A correction
          from you restarts the work at the {name(health.graph.replan_entry).toLowerCase()} step.
        </p>
      </div>
    </div>
  );
}
