import { useState } from "react";
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
import { BarLink, FilterChips, PageHeader, PagePad, TopBar, TopSurface } from "../shell/WorkSurface";

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

/** What the plan list is narrowed to: everything, or one kind of action. */
type Show = "all" | PlannedAction["type"];

function PlanView({ batch }: { batch: BatchResult }) {
  const { setView } = useAppView();
  const [show, setShow] = useState<Show>("all");
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
          Open Show test details on Home and read How this was worked out to see why.
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
  const filters: { key: Show; label: string; count: number }[] = [
    { key: "all", label: "Everything", count: all.filter((a) => a.type !== "feedback_review").length },
    { key: "group_reteach", label: "Whole-class re-teach", count: count("group_reteach") },
    { key: "peer_pairing", label: "Pairings", count: count("peer_pairing") },
    { key: "individual_followup", label: "Individual follow-ups", count: count("individual_followup") },
    { key: "feedback_review", label: "Notes to send", count: count("feedback_review") },
  ];

  const bar = (
    <TopBar>
      <FilterChips
        label="Show"
        options={filters.filter((f) => f.key === "all" || f.count > 0)}
        value={show}
        onChange={setShow}
      />
      {batch.changes.length > 0 && (
        <span className="text-sm text-ink-muted">
          <span className="num font-semibold text-ink">{batch.changes.length}</span> changed since
          your correction.
        </span>
      )}
      <span className="ml-auto flex flex-wrap gap-2">
        <BarLink
          tone="neutral"
          title="See who made each mistake"
          hint="The Class page shows which students share a problem."
          onClick={() => setView("class")}
        />
      </span>
    </TopBar>
  );

  return (
    <TopSurface
      bar={bar}
      header={
        <PageHeader
          title="Action plan"
          subtitle="Start with the mistakes that cost the most marks. The plan is a proposal: nothing is sent or scheduled until you do it."
        />
      }
    >
      <div className="space-y-8">
        <ChangeList changes={batch.changes} />
        <Planned plan={plan} changed={changed} show={show} />
        {(show === "all" || show === "feedback_review") && (
          <div id="student-notes">
            <StudentNotes />
          </div>
        )}
      </div>
    </TopSurface>
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
  show,
}: {
  plan: InterventionPlan;
  changed: Map<string, PlanChange["kind"]>;
  show: Show;
}) {
  const first = split(plan.scheduled);
  const later = split(plan.dropped);
  // One severity order across both groups, so a high-severity action the
  // planner could not fit is not buried under lower ones it did.
  const cards = [...first.cards, ...later.cards]
    .filter((a) => show === "all" || a.type === show)
    .sort((a, b) => b.severity - a.severity);
  const feedback =
    show === "all" || show === "feedback_review" ? [...first.feedback, ...later.feedback] : [];
  return (
    <section aria-labelledby="plan-first-title">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="plan-first-title" className="text-base font-semibold text-ink">
          {show === "feedback_review" ? "Notes to check before sending" : "Do these first"}
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
