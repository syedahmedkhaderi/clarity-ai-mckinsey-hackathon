import { AgentTrace, TraceLog } from "../components/AgentTrace";
import { BatchRunner } from "../components/BatchRunner";
import { Collapsible } from "../components/ui/Collapsible";
import { useAppView } from "../hooks/useAppView";
import { useSession } from "../hooks/useSession";
import { AGENT_LABELS, analysisLabel } from "../lib/format";
import { BRAND_NAME } from "../lib/brand";
import type { BatchResult, Health } from "../types";

export function HomePage() {
  const s = useSession();
  const { setView } = useAppView();
  const selected = s.tests.find((t) => t.id === s.selectedTest);

  return (
    <div className="space-y-5">
      <header className="flex items-start gap-4">
        <div>
          <h1 className="text-lg font-semibold text-ink">Your tests</h1>
          <p className="text-sm text-ink-muted mt-0.5">
            {BRAND_NAME} marks a class's answers as drafts, finds the mistake pattern behind each
            lost mark, and plans how to spend your time. Nothing counts until you confirm it.
          </p>
        </div>
        <button className="btn btn-primary ml-auto shrink-0" onClick={() => setView("upload")}>
          Add a test
        </button>
      </header>

      <BatchRunner
        assignments={s.tests}
        selected={s.selectedTest}
        onSelect={s.setSelectedTest}
        minutes={s.minutes}
        onMinutes={s.setMinutes}
        onRun={s.run}
        running={s.running}
        stage={s.stage}
        elapsedMs={s.elapsedMs}
        blockedReason={selected ? s.runBlockedReason(selected) : null}
        topicName={s.topicName}
      />

      <Summary batch={s.batch} testName={s.testName} />

      <Collapsible
        title="How this was worked out"
        hint={s.running ? (s.stage ?? "Starting") : "The steps, in order, for anyone who wants to check."}
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <AgentTrace events={s.trace} status={s.status} elapsedMs={s.elapsedMs} />
          <GraphShape health={s.health} />
        </div>
        {s.trace.length > 0 && <TraceLog events={s.trace} />}
      </Collapsible>
    </div>
  );
}

function Summary({
  batch,
  testName,
}: {
  batch: BatchResult | null;
  testName: (id: string) => string;
}) {
  if (!batch) return null;
  const rows: [string, string][] = [
    ["Answers marked", `${batch.marks.length}`],
    ["Answers that lost marks", `${batch.marks.filter((m) => m.awarded < m.max_marks).length}`],
    ["Mistake patterns found", `${batch.diagnoses.length}`],
    ["Needs your call", `${batch.escalations.length}`],
    [
      "Follow-up planned",
      batch.plan ? `${batch.plan.minutes_used} of ${batch.plan.budget_minutes} min` : "not built",
    ],
    ["Did not fit your time", batch.plan ? `${batch.plan.dropped.length} actions` : "n/a"],
  ];
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">This analysis</div>
        <span className="panel-sub">
          {analysisLabel(testName(batch.assessment_id), batch.trace[0]?.timestamp)}
        </span>
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
  const name = (node: string) => AGENT_LABELS[node] ?? node;
  return (
    <div className="panel h-fit">
      <div className="panel-head">
        <div className="panel-title">Order of the steps</div>
      </div>
      <div className="p-4 space-y-2">
        <ol className="text-xs text-ink-muted space-y-1">
          {health.graph.edges.map(([a, b], i) => (
            <li key={i}>
              {name(a)} to {name(b)}
            </li>
          ))}
        </ol>
        <p className="text-2xs text-ink-faint pt-2 border-t border-line">
          The safety check runs after{" "}
          {health.graph.reviewer_gated.map((n) => name(n).toLowerCase()).join(", ")}. A correction
          from you restarts the work at the {name(health.graph.replan_entry).toLowerCase()} step.
        </p>
      </div>
    </div>
  );
}
