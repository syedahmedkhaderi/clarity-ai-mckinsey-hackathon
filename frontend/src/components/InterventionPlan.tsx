import clsx from "clsx";
import type { PlanChange, PlannedAction } from "../types";
import { ACTION_LABELS, PLAN_CHANGE_LABELS, severityLabel } from "../lib/format";
import { useSession } from "../hooks/useSession";

export function ActionCard({
  action,
  changed,
  dropped = false,
}: {
  action: PlannedAction;
  changed?: PlanChange["kind"];
  dropped?: boolean;
}) {
  const { highSeverityFloor, patternName } = useSession();
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
        <span className="text-xs text-ink-faint">{severityLabel(action.severity, highSeverityFloor)}</span>
        {action.node_id && <span className="text-xs text-ink-faint">{patternName(action.node_id)}</span>}
        {changed === "rescheduled" && (
          <span className="tag border-agent-line bg-agent-soft text-agent">
            Now planned after your correction
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
        <p className="mt-1.5 text-xs text-flag">Left out: {action.drop_reason}.</p>
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
          <div className="panel-title text-agent">The plan changed after your correction</div>
          <div className="panel-sub text-agent/70">
            The class picture was worked out again and the plan rebuilt. Marks were not read
            again.
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
              {PLAN_CHANGE_LABELS[c.kind] ?? c.kind}
            </span>
            <span className="text-ink-muted">{c.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
