import { useState } from "react";
import { ActionCard, ChangeList, FeedbackChecks } from "../components/InterventionPlan";
import { TimeBudgetBar } from "../components/charts/TimeBudgetBar";
import { Collapsible } from "../components/ui/Collapsible";
import { EmptyState } from "../components/ui/EmptyState";
import { Panel } from "../components/ui/Panel";
import { Tag } from "../components/ui/Tag";
import { StudentNotes } from "../features/email/StudentNotes";
import { useAppView } from "../hooks/useAppView";
import { useSession } from "../hooks/useSession";
import { STATUS_LABELS, scoreText } from "../lib/format";
import type { BatchResult, InterventionPlan, PlanChange, PlannedAction } from "../types";

export function PlanPage() {
  const { batch } = useSession();
  return batch ? <PlanView batch={batch} /> : null;
}

/** Feedback checks are folded into one row, so they are pulled out of the card list. */
function split(actions: PlannedAction[]) {
  return {
    cards: [...actions]
      .filter((a) => a.type !== "feedback_review")
      .sort((a, b) => b.severity - a.severity),
    feedback: actions.filter((a) => a.type === "feedback_review"),
  };
}

function PlanView({ batch }: { batch: BatchResult }) {
  const { setView } = useAppView();
  const plan = batch.plan;
  if (!plan) {
    return (
      <EmptyState
        title="No plan was built for this analysis."
        action={
          <button className="btn" onClick={() => setView("home")}>
            Go to Home
          </button>
        }
      >
        The steps under How this was worked out on Home explain why.
      </EmptyState>
    );
  }
  const changed = new Map<string, PlanChange["kind"]>(
    batch.changes.filter((c) => c.action_id).map((c) => [c.action_id as string, c.kind]),
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-lg font-semibold text-ink">Action plan</h1>
        <p className="text-sm text-ink-muted mt-0.5">
          Use your {plan.budget_minutes} minutes on the mistakes that cost the most marks.
        </p>
      </header>

      <ChangeList changes={batch.changes} />

      <Panel>
        <TimeBudgetBar
          used={plan.minutes_used}
          budget={plan.budget_minutes}
          dropped={plan.dropped.reduce((sum, a) => sum + a.cost_minutes, 0)}
        />
      </Panel>

      <Planned plan={plan} changed={changed} />
      <LeftOut plan={plan} />
      <ConfirmMarks batch={batch} />

      <div className="pt-2">
        <StudentNotes />
      </div>
    </div>
  );
}

function Planned({
  plan,
  changed,
}: {
  plan: InterventionPlan;
  changed: Map<string, PlanChange["kind"]>;
}) {
  const { cards, feedback } = split(plan.scheduled);
  return (
    <section>
      <h2 className="text-sm font-semibold text-ink mb-2">Do these first</h2>
      {cards.length === 0 && feedback.length === 0 && (
        <p className="text-sm text-ink-muted">Nothing fitted into your time.</p>
      )}
      <div className="grid gap-3 md:grid-cols-2 items-start">
        {cards.map((a, i) => (
          <ActionCard key={a.action_id} action={a} order={i + 1} changed={changed.get(a.action_id)} />
        ))}
      </div>
      {feedback.length > 0 && (
        <div className="mt-3">
          <FeedbackChecks actions={feedback} feedback={plan.feedback} />
        </div>
      )}
    </section>
  );
}

function LeftOut({ plan }: { plan: InterventionPlan }) {
  if (!plan.dropped.length) return null;
  const { cards, feedback } = split(plan.dropped);
  const minutes = plan.dropped.reduce((sum, a) => sum + a.cost_minutes, 0);
  return (
    <Collapsible
      title="Did not fit your time"
      hint={`${plan.dropped.length} ${plan.dropped.length === 1 ? "action" : "actions"}, ${minutes} minutes`}
    >
      <p className="text-sm text-ink-muted">
        There was not time for these. To fit more, raise your minutes on Home and analyse the test
        again.
      </p>
      <div className="grid gap-3 md:grid-cols-2 items-start">
        {cards.map((a) => (
          <ActionCard key={a.action_id} action={a} dropped />
        ))}
      </div>
      <FeedbackChecks actions={feedback} feedback={plan.feedback} dropped />
    </Collapsible>
  );
}

interface StudentMarks {
  id: string;
  name: string;
  awarded: number;
  outOf: number;
  /** Marks held back in To review. Confirming cannot reach them. */
  held: number;
  confirmed: boolean;
  /** False when every mark is held in To review, so there is nothing to confirm here. */
  reachable: boolean;
}

/**
 * The status comes from the marks the confirm call can reach; the total comes
 * from every mark, so a student whose answer is waiting in To review still shows
 * a full score out of the right number.
 */
function studentMarks(batch: BatchResult): StudentMarks[] {
  const every = batch.all_marks ?? batch.marks;
  return batch.learners.map((l) => {
    const all = every.filter((m) => m.learner_id === l.learner_id);
    const reachable = batch.marks.filter((m) => m.learner_id === l.learner_id);
    return {
      id: l.learner_id,
      name: l.learner_name,
      awarded: all.reduce((sum, m) => sum + m.awarded, 0),
      outOf: all.reduce((sum, m) => sum + m.max_marks, 0),
      held: all.length - reachable.length,
      confirmed: reachable.length > 0 && reachable.every((m) => !m.provisional),
      reachable: reachable.length > 0,
    };
  });
}

function ConfirmMarks({ batch }: { batch: BatchResult }) {
  const { approve } = useSession();
  const [busy, setBusy] = useState(false);
  const rows = studentMarks(batch);
  const waiting = rows.filter((r) => r.reachable && !r.confirmed);

  const confirm = async (ids: string[]) => {
    setBusy(true);
    try {
      await approve(ids);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Confirm marks"
      subtitle="Marks stay drafts until you confirm them."
      action={
        <button
          className="btn btn-primary shrink-0"
          disabled={busy || waiting.length === 0}
          onClick={() => confirm(waiting.map((r) => r.id))}
        >
          Confirm all marks
        </button>
      }
      flush
    >
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Marks</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="text-sm text-ink">{r.name}</td>
                <td className="num text-ink-muted whitespace-nowrap">
                  {scoreText(r.awarded)} of {scoreText(r.outOf)}
                </td>
                <td>
                  <Tag tone={r.confirmed ? "neutral" : "flag"}>
                    {r.confirmed ? STATUS_LABELS.confirmed : STATUS_LABELS.draft}
                  </Tag>
                  {r.held > 0 && (
                    <span className="ml-2 text-xs text-ink-faint">
                      {r.held === 1 ? "1 mark is" : `${r.held} marks are`} in To review
                    </span>
                  )}
                </td>
                <td className="text-right">
                  {r.reachable && !r.confirmed && (
                    <button className="btn btn-xs" disabled={busy} onClick={() => confirm([r.id])}>
                      {STATUS_LABELS.confirm}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
