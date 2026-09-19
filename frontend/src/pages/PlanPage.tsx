import {
  ActionCard,
  ChangeList,
  FeedbackChecks,
} from "../components/InterventionPlan";
import { EmptyState } from "../components/ui/EmptyState";
import { StudentNotes } from "../features/email/StudentNotes";
import { useAppView } from "../hooks/useAppView";
import { useSession } from "../hooks/useSession";
import type {
  BatchResult,
  InterventionPlan,
  PlanChange,
  PlannedAction,
} from "../types";
import { PageHeader, PagePad, RailLink, RailSection, RailStat, WorkSurface } from "../shell/WorkSurface";

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
      <PagePad>
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
      </PagePad>
    );
  }
  const changed = new Map<string, PlanChange["kind"]>(
    batch.changes
      .filter((c) => c.action_id)
      .map((c) => [c.action_id as string, c.kind]),
  );
  const all = [...plan.scheduled, ...plan.dropped];
  const count = (type: PlannedAction["type"]) => all.filter((a) => a.type === type).length;

  const rail = (
    <>
      <RailSection title="This plan">
        <RailStat label="Things to do" value={all.filter((a) => a.type !== "feedback_review").length} />
        <RailStat label="Whole-class re-teach" value={count("group_reteach")} />
        <RailStat label="Individual follow-ups" value={count("individual_followup")} />
        <RailStat label="Notes to send" value={count("feedback_review")} />
        {batch.changes.length > 0 && (
          <RailStat label="Changed since your correction" value={batch.changes.length} />
        )}
      </RailSection>
      <RailSection title="Where to go">
        <div className="flex flex-col gap-2">
          <RailLink
            tone="neutral"
            title="See who made each mistake"
            hint="The Class page shows which students share a problem."
            onClick={() => setView("class")}
          />
          <RailLink
            tone="neutral"
            title="Read the notes to students"
            hint="Each one is drafted for you to read and send yourself."
            onClick={() => document.getElementById("student-notes")?.scrollIntoView({ behavior: "smooth" })}
          />
        </div>
      </RailSection>
      <p className="mt-auto border-t border-line pt-4 text-2xs leading-4 text-ink-muted">
        The plan is a proposal. Nothing is sent or scheduled until you do it.
      </p>
    </>
  );

  return (
    <WorkSurface
      rail={rail}
      header={
        <PageHeader
          title="Action plan"
          subtitle="Start with the mistakes that cost the most marks. Each note to a student is drafted for you to read and send yourself."
        />
      }
    >
      <div className="space-y-8">
        <ChangeList changes={batch.changes} />
        <Planned plan={plan} changed={changed} />
        <div id="student-notes">
          <StudentNotes />
        </div>
      </div>
    </WorkSurface>
  );
}

/**
 * Everything the planner proposed, in priority order. Actions it placed first
 * come first; the ones it ranked lower follow in the same list, so nothing the
 * planner considered is hidden from the teacher.
 */
function Planned({
  plan,
  changed,
}: {
  plan: InterventionPlan;
  changed: Map<string, PlanChange["kind"]>;
}) {
  const first = split(plan.scheduled);
  const later = split(plan.dropped);
  // One severity order across both groups, so a high-severity action the
  // planner could not fit is not buried under lower ones it did.
  const cards = [...first.cards, ...later.cards].sort(
    (a, b) => b.severity - a.severity,
  );
  const feedback = [...first.feedback, ...later.feedback];
  return (
    <section aria-labelledby="plan-first-title">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="plan-first-title" className="text-base font-semibold text-ink">
          Do these first
        </h2>
        {cards.length > 0 && (
          <p className="text-xs text-ink-faint">
            {cards.length} {cards.length === 1 ? "action" : "actions"}, most
            important first.
          </p>
        )}
      </div>
      {cards.length === 0 && feedback.length === 0 && (
        <p className="text-sm text-ink-muted">
          Nothing needs doing from this analysis.
        </p>
      )}
      <div className="grid items-start gap-4 md:grid-cols-2">
        {cards.map((a, i) => (
          <ActionCard
            key={a.action_id}
            action={a}
            order={i + 1}
            changed={changed.get(a.action_id)}
          />
        ))}
      </div>
      {feedback.length > 0 && (
        <div className="mt-4">
          <FeedbackChecks actions={feedback} feedback={plan.feedback} />
        </div>
      )}
    </section>
  );
}
