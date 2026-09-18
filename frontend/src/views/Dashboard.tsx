import type { Assignment, BatchResult, Health, TraceEvent } from "../types";
import { AgentTrace, TraceLog } from "../components/AgentTrace";
import { BatchRunner } from "../components/BatchRunner";

export function Dashboard({
  assignments,
  selected,
  onSelect,
  minutes,
  onMinutes,
  onRun,
  running,
  trace,
  status,
  batch,
  health,
}: {
  assignments: Assignment[];
  selected: string;
  onSelect: (id: string) => void;
  minutes: number;
  onMinutes: (m: number) => void;
  onRun: () => void;
  running: boolean;
  trace: TraceEvent[];
  status: string;
  batch: BatchResult | null;
  health: Health | null;
}) {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold text-ink">Assignments</h1>
        <p className="text-sm text-ink-muted mt-0.5">
          LOOP reads a submitted batch, marks it provisionally, names the misconception behind
          each error, and decides how to spend your time. You approve everything that counts.
        </p>
      </header>

      <BatchRunner
        assignments={assignments}
        selected={selected}
        onSelect={onSelect}
        minutes={minutes}
        onMinutes={onMinutes}
        onRun={onRun}
        running={running}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <AgentTrace events={trace} status={status} />
        <div className="space-y-5">
          <Summary batch={batch} />
          <GraphShape health={health} />
        </div>
      </div>

      {trace.length > 0 && <TraceLog events={trace} />}
    </div>
  );
}

function Summary({ batch }: { batch: BatchResult | null }) {
  if (!batch) return null;
  const rows: [string, string][] = [
    ["Responses marked", `${batch.marks.length}`],
    ["Lost marks", `${batch.marks.filter((m) => m.awarded < m.max_marks).length}`],
    ["Misconceptions named", `${batch.diagnoses.length}`],
    ["Sent to a human", `${batch.escalations.length}`],
    [
      "Plan",
      batch.plan ? `${batch.plan.minutes_used} of ${batch.plan.budget_minutes} min` : "not built",
    ],
    ["Left unscheduled", batch.plan ? `${batch.plan.dropped.length} actions` : "n/a"],
  ];
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">This run</div>
        <span className="panel-sub num">{batch.batch_id}</span>
      </div>
      <table>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td className="text-xs text-ink-muted">{k}</td>
              <td className="num text-right text-ink">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GraphShape({ health }: { health: Health | null }) {
  if (!health) return null;
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">Graph</div>
        <span className="panel-sub">{health.mode}</span>
      </div>
      <div className="p-4 space-y-2">
        <ol className="text-xs text-ink-muted space-y-1">
          {health.graph.edges.map(([a, b], i) => (
            <li key={i} className="num">
              {a} to {b}
            </li>
          ))}
        </ol>
        <p className="text-2xs text-ink-faint pt-2 border-t border-line">
          The reviewer gate runs at the end of {health.graph.reviewer_gated.join(", ")}. An
          override re-enters at {health.graph.replan_entry}.
        </p>
      </div>
    </div>
  );
}
