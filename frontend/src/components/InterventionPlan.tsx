import clsx from "clsx";
import type { InterventionPlan as Plan, PlanChange, PlannedAction } from "../types";
import { ACTION_LABELS } from "../lib/format";

export function BudgetBar({ plan }: { plan: Plan }) {
  const used = Math.min(plan.minutes_used, plan.budget_minutes);
  const droppedMinutes = plan.dropped.reduce((s, a) => s + a.cost_minutes, 0);
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs mb-1.5">
        <span className="text-ink-muted">
          <span className="num text-ink font-medium">{plan.minutes_used}</span> of{" "}
          <span className="num">{plan.budget_minutes}</span> facilitator minutes scheduled
        </span>
        <span className="text-ink-faint">
          <span className="num">{droppedMinutes}</span> minutes of work did not fit
        </span>
      </div>
      <div className="h-2 rounded-full bg-surface-sunken border border-line overflow-hidden flex">
        <div
          className="bg-agent h-full"
          style={{ width: `${(used / plan.budget_minutes) * 100}%` }}
        />
      </div>
    </div>
  );
}

export function ActionCard({
  action,
  changed,
  dropped = false,
}: {
  action: PlannedAction;
  changed?: PlanChange["kind"];
  dropped?: boolean;
}) {
  return (
    <div
      className={clsx(
        "rounded-md border p-3",
        dropped ? "border-line bg-surface-sunken" : "border-line bg-surface",
        changed === "added" || changed === "rescheduled" ? "ring-2 ring-agent-line border-agent-line" : "",
      )}
    >
      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <span
          className={clsx(
            "tag",
            dropped
              ? "border-line-strong bg-surface text-ink-muted"
              : "border-agent-line bg-agent-soft text-agent",
          )}
        >
          {ACTION_LABELS[action.type] ?? action.type}
        </span>
        <span className="num text-ink-muted">{action.cost_minutes} min</span>
        <span className="num text-ink-faint" title="Severity, 0.00 to 1.00">
          sev {action.severity.toFixed(2)}
        </span>
        {action.node_id && <span className="num text-ink-faint">{action.node_id}</span>}
        {changed === "rescheduled" && (
          <span className="tag border-agent-line bg-agent-soft text-agent">
            Now scheduled after the override
          </span>
        )}
        {changed === "added" && (
          <span className="tag border-agent-line bg-agent-soft text-agent">New</span>
        )}
      </div>
      <div className={clsx("text-sm font-medium mb-1", dropped ? "text-ink-muted" : "text-ink")}>
        {action.title}
      </div>
      <p className="text-xs text-ink-muted">{action.justification}</p>
      {action.facilitator_script && !dropped && (
        <p className="mt-2 text-xs text-ink-muted border-l-2 border-line-strong pl-2.5">
          <span className="text-2xs uppercase tracking-wide text-ink-faint block mb-0.5">
            What to say or do
          </span>
          {action.facilitator_script}
        </p>
      )}
      {dropped && action.drop_reason && (
        <p className="mt-1.5 text-xs text-flag">Not scheduled: {action.drop_reason}.</p>
      )}
    </div>
  );
}

export function ChangeList({ changes }: { changes: PlanChange[] }) {
  if (!changes.length) return null;
  return (
    <div className="panel border-agent-line">
      <div className="panel-head bg-agent-soft border-agent-line">
        <div>
          <div className="panel-title text-agent">The plan changed after your override</div>
          <div className="panel-sub text-agent/70">
            The agent re-entered the graph at the cohort analyst. Marks below the override
            were not re-run.
          </div>
        </div>
      </div>
      <ul className="divide-y divide-line">
        {changes.map((c, i) => (
          <li key={i} className="px-4 py-2 flex gap-3 text-sm">
            <span
              className={clsx(
                "tag shrink-0",
                c.kind === "removed"
                  ? "border-flag-line bg-flag-soft text-flag"
                  : "border-agent-line bg-agent-soft text-agent",
              )}
            >
              {c.kind}
            </span>
            <span className="text-ink-muted">{c.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
