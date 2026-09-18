import { useState } from "react";
import type { BatchResult } from "../types";
import { ActionCard, BudgetBar, ChangeList } from "../components/InterventionPlan";

export function PlanView({
  batch,
  onApprove,
}: {
  batch: BatchResult;
  onApprove: (learnerId: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const plan = batch.plan;
  if (!plan) {
    return (
      <div className="panel p-8">
        <p className="text-sm text-ink-muted">
          No plan was built for this run. The trace explains why.
        </p>
      </div>
    );
  }
  const changed = new Map(batch.changes.map((c) => [c.action_id, c.kind]));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold text-ink">Intervention plan</h1>
        <p className="text-sm text-ink-muted mt-0.5">{plan.goal}</p>
      </header>

      <ChangeList changes={batch.changes} />

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">Time budget</div>
          <span className="panel-sub">
            {plan.scheduled.length} scheduled, {plan.dropped.length} not scheduled
          </span>
        </div>
        <div className="p-4">
          <BudgetBar plan={plan} />
        </div>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-ink mb-2">Scheduled</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {plan.scheduled.map((a) => (
            <ActionCard
              key={a.action_id}
              action={a}
              changed={changed.get(a.action_id) as never}
            />
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-baseline gap-2 mb-2">
          <h2 className="text-sm font-semibold text-ink">Not scheduled</h2>
          <span className="text-xs text-ink-muted">
            The agent could not do everything in {plan.budget_minutes} minutes. This is what it
            left, and why.
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
            {open === "dropped"
              ? "Show fewer"
              : `Show all ${plan.dropped.length} unscheduled actions`}
          </button>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="panel-title">Drafted feedback</div>
            <div className="panel-sub">
              Written for delivery by a facilitator who is not a subject specialist. Drafts are
              produced for every learner, whether or not the review time fitted the budget.
            </div>
          </div>
        </div>
        <ul className="divide-y divide-line">
          {plan.feedback.map((f) => (
            <li key={f.learner_id} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-2 mb-1">
                <span className="text-sm font-medium text-ink">{f.learner_name}</span>
                <span className="num text-ink-faint">{f.node_ids.join(", ")}</span>
                <span className="ml-auto flex items-center gap-2">
                  {f.approved ? (
                    <span className="tag border-line bg-surface-sunken text-ink-muted">
                      approved
                    </span>
                  ) : (
                    <>
                      <span className="tag border-flag-line bg-flag-soft text-flag">
                        provisional
                      </span>
                      <button className="btn btn-xs" onClick={() => onApprove(f.learner_id)}>
                        Approve
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
    </div>
  );
}
