import { useState } from "react";
import { ActionCard, ChangeList } from "../components/InterventionPlan";
import { TimeBudgetBar } from "../components/charts/TimeBudgetBar";
import { StudentNotes } from "../features/email/StudentNotes";
import { useSession } from "../hooks/useSession";
import { STATUS_LABELS } from "../lib/format";
import type { BatchResult, PlanChange } from "../types";

export function PlanPage() {
  const { batch } = useSession();
  return batch ? <PlanView batch={batch} /> : null;
}

function PlanView({ batch }: { batch: BatchResult }) {
  const s = useSession();
  const [open, setOpen] = useState<string | null>(null);
  const plan = batch.plan;
  if (!plan) {
    return (
      <div className="panel p-8">
        <p className="text-sm text-ink-muted">
          No plan was built for this analysis. The steps under How this was worked out on Home
          explain why.
        </p>
      </div>
    );
  }
  const changed = new Map<string, PlanChange["kind"]>(
    batch.changes.filter((c) => c.action_id).map((c) => [c.action_id as string, c.kind]),
  );
  const droppedMinutes = plan.dropped.reduce((sum, a) => sum + a.cost_minutes, 0);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold text-ink">Action plan</h1>
        <p className="text-sm text-ink-muted mt-0.5">{plan.goal}</p>
      </header>

      <ChangeList changes={batch.changes} />

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">Your time</div>
          <span className="panel-sub">
            {plan.scheduled.length} planned, {plan.dropped.length} did not fit
          </span>
        </div>
        <div className="p-4">
          <TimeBudgetBar
            used={plan.minutes_used}
            budget={plan.budget_minutes}
            dropped={droppedMinutes}
          />
        </div>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-ink mb-2">Planned</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {plan.scheduled.map((a) => (
            <ActionCard key={a.action_id} action={a} changed={changed.get(a.action_id)} />
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-baseline gap-2 mb-2">
          <h2 className="text-sm font-semibold text-ink">Did not fit your time</h2>
          <span className="text-xs text-ink-muted">
            There was not time for everything in {plan.budget_minutes} minutes. This is what was
            left out, and why.
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {plan.dropped.slice(0, open === "dropped" ? undefined : 6).map((a) => (
            <ActionCard key={a.action_id} action={a} dropped />
          ))}
        </div>
        {plan.dropped.length > 6 && (
          <button
            className="btn btn-xs mt-3"
            onClick={() => setOpen(open === "dropped" ? null : "dropped")}
          >
            {open === "dropped" ? "Show fewer" : `Show all ${plan.dropped.length}`}
          </button>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="panel-title">Notes for students</div>
            <div className="panel-sub">
              A short note is drafted for every student, whether or not there was time to check it.
            </div>
          </div>
        </div>
        <ul className="divide-y divide-line">
          {plan.feedback.map((f) => (
            <li key={f.learner_id} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-2 mb-1">
                <span className="text-sm font-medium text-ink">{f.learner_name}</span>
                <span className="text-xs text-ink-faint">
                  {f.node_ids.map(s.patternName).join(", ")}
                </span>
                <span className="ml-auto flex items-center gap-2">
                  {f.approved ? (
                    <span className="tag border-line bg-surface-sunken text-ink-muted">
                      {STATUS_LABELS.confirmed}
                    </span>
                  ) : (
                    <>
                      <span className="tag border-flag-line bg-flag-soft text-flag">
                        {STATUS_LABELS.draft}
                      </span>
                      <button className="btn btn-xs" onClick={() => s.approve([f.learner_id])}>
                        {STATUS_LABELS.confirm}
                      </button>
                    </>
                  )}
                </span>
              </div>
              <p className="text-sm text-ink-muted">{f.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <StudentNotes />
    </div>
  );
}
