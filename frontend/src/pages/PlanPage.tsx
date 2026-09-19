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
import { severityLevel } from "../lib/format";
import type { BatchResult, PlanChange, PlannedAction } from "../types";
import { BarLink, FilterChips, PageHeader, PagePad, TopBar, TopSurface } from "../shell/WorkSurface";

export function PlanPage() {
  const { batch } = useSession();
  return batch ? <PlanView batch={batch} /> : null;
}

/**
 * The plan in three pages. First comes what moves the most marks: the whole-class
 * re-teach and anything the planner rated high priority. Then the smaller work
 * with one or two students. Then the notes to students, drafted for checking.
 * An action appears on exactly one page.
 */
type Page = "first" | "smaller" | "notes";

function PlanView({ batch }: { batch: BatchResult }) {
  const { highSeverityFloor } = useSession();
  const [page, setPage] = useState<Page>("first");
  const plan = batch.plan;
  if (!plan) return <NoPlan />;
  const changed = new Map<string, PlanChange["kind"]>(
    batch.changes.filter((c) => c.action_id).map((c) => [c.action_id as string, c.kind]),
  );
  // One severity order across what the planner fitted and what it could not, so a
  // high-severity action that missed the budget is not buried under lower ones.
  const all = [...plan.scheduled, ...plan.dropped].sort((a, b) => b.severity - a.severity);
  const first = (a: PlannedAction) =>
    a.type === "group_reteach" || severityLevel(a.severity, highSeverityFloor) === "high";
  const cards = all.filter((a) => a.type !== "feedback_review");
  const feedback = all.filter((a) => a.type === "feedback_review");
  const pages: { key: Page; label: string; count: number }[] = [
    { key: "first", label: "Do these first", count: cards.filter(first).length },
    { key: "smaller", label: "Pairings and follow-ups", count: cards.filter((a) => !first(a)).length },
    { key: "notes", label: "Notes to send", count: feedback.length },
  ];

  return (
    <TopSurface
      bar={
        <PlanBar pages={pages} page={page} onPage={setPage} changes={batch.changes.length} />
      }
      header={
        <PageHeader
          title="Action plan"
          subtitle="Start with the mistakes that cost the most marks. The plan is a proposal: nothing is sent or scheduled until you do it."
        />
      }
    >
      {page === "first" && (
        <div className="space-y-8">
          <ChangeList changes={batch.changes} />
          <Cards
            actions={cards.filter(first)}
            changed={changed}
            empty="Nothing here is urgent. The smaller pieces of work are on Pairings and follow-ups."
          />
        </div>
      )}
      {page === "smaller" && (
        <Cards
          actions={cards.filter((a) => !first(a))}
          changed={changed}
          empty="No pairings or one-to-one follow-ups in this plan."
        />
      )}
      {page === "notes" && (
        <div className="space-y-6">
          {feedback.length > 0 && <FeedbackChecks actions={feedback} feedback={plan.feedback} />}
          <StudentNotes />
        </div>
      )}
    </TopSurface>
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

function PlanBar({
  pages,
  page,
  onPage,
  changes,
}: {
  pages: { key: Page; label: string; count: number }[];
  page: Page;
  onPage: (p: Page) => void;
  changes: number;
}) {
  const { setView } = useAppView();
  return (
    <TopBar
      end={
        <BarLink
          tone="neutral"
          title="See who made each mistake"
          hint="The Class page shows which students share a problem."
          onClick={() => setView("class")}
        />
      }
    >
      <FilterChips label="Plan pages" options={pages} value={page} onChange={onPage} />
      {changes > 0 && (
        <span className="text-sm text-ink-muted">
          <span className="num font-semibold text-ink">{changes}</span> changed since your
          correction.
        </span>
      )}
    </TopBar>
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
