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
import type { BatchResult, PlanChange, PlannedAction } from "../types";
import { BarLink, PageHeader, PagePad, TopSurface, type TabItem } from "../shell/WorkSurface";

export function PlanPage() {
  const { batch } = useSession();
  return batch ? <PlanView batch={batch} /> : null;
}

/**
 * The plan in two sections: the actions, most important first, and the notes to
 * students, drafted for checking. The whole-class re-teach and the one-to-one
 * work share a list because they compete for the same time.
 */
type Section = "actions" | "notes";

function PlanView({ batch }: { batch: BatchResult }) {
  const [section, setSection] = useState<Section>("actions");
  const plan = batch.plan;
  if (!plan) return <NoPlan />;
  const changed = new Map<string, PlanChange["kind"]>(
    batch.changes.filter((c) => c.action_id).map((c) => [c.action_id as string, c.kind]),
  );
  // One severity order across what the planner fitted and what it could not, so a
  // high-severity action that missed the budget is not buried under lower ones.
  const all = [...plan.scheduled, ...plan.dropped].sort((a, b) => b.severity - a.severity);
  const cards = all.filter((a) => a.type !== "feedback_review");
  const feedback = all.filter((a) => a.type === "feedback_review");
  const sections: TabItem<Section>[] = [
    { key: "actions", label: `Actions (${cards.length})` },
    { key: "notes", label: `Notes to send (${feedback.length})` },
  ];

  return (
    <TopSurface
      header={
        <PageHeader
          title="Action plan"
          subtitle="Start with the mistakes that cost the most marks. The plan is a proposal: nothing is sent or scheduled until you do it."
          tabs={sections}
          active={section}
          onTab={setSection}
          action={<SeeWho />}
        />
      }
    >
      {section === "actions" ? (
        <div className="space-y-8">
          <ChangeList changes={batch.changes} />
          <Cards actions={cards} changed={changed} empty="Nothing needs doing from this analysis." />
        </div>
      ) : (
        <div className="space-y-6">
          {feedback.length > 0 && <FeedbackChecks actions={feedback} feedback={plan.feedback} />}
          <StudentNotes />
        </div>
      )}
    </TopSurface>
  );
}

function SeeWho() {
  const { setView } = useAppView();
  return (
    <BarLink
      tone="neutral"
      title="See who made each mistake"
      hint="The Class page shows which students share a problem."
      onClick={() => setView("class")}
    />
  );
}

function NoPlan() {
  const { setView } = useAppView();
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

/** Plan actions as cards, most important first. Cards are for plan actions only. */
function Cards({
  actions,
  changed,
  empty,
}: {
  actions: PlannedAction[];
  changed: Map<string, PlanChange["kind"]>;
  empty: string;
}) {
  if (actions.length === 0) return <p className="text-sm text-ink-muted">{empty}</p>;
  return (
    <section>
      <p className="mb-3 text-xs text-ink-faint">
        {actions.length} {actions.length === 1 ? "action" : "actions"}, most important first.
      </p>
      <div className="grid items-start gap-4 md:grid-cols-2">
        {actions.map((a, i) => (
          <ActionCard key={a.action_id} action={a} order={i + 1} changed={changed.get(a.action_id)} />
        ))}
      </div>
    </section>
  );
}
