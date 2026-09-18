import clsx from "clsx";
import { useState, type ReactNode } from "react";
import type { DraftedFeedback, PlanChange, PlannedAction } from "../types";
import {
  ACTION_LABELS,
  PLAN_CHANGE_PLAIN_LABELS,
  dropReasonText,
  planChangeTitle,
  stripNodeIds,
  severityLabel,
  severityLevel,
} from "../lib/format";
import { useSession } from "../hooks/useSession";
import { Tag } from "./ui/Tag";

/** Names shown on a card before the rest collapse into "and 3 more". */
const NAMES_SHOWN = 4;

/** A "show more" control in plain text, so a card stays quiet until it is asked. */
function Expander({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="text-xs font-medium text-ink-muted hover:text-ink"
      >
        {label} <span className="text-ink-faint">{open ? "(hide)" : "(show)"}</span>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

function usePlain() {
  const { plain } = useSession();
  return (text: string) => plain(stripNodeIds(text));
}

function StudentNames({ ids }: { ids: string[] }) {
  const { learnerName } = useSession();
  if (!ids.length) return null;
  const names = ids.map(learnerName);
  const more = names.length - NAMES_SHOWN;
  return (
    <p className="text-xs text-ink-muted" title={names.join(", ")}>
      <span className="text-ink-faint">{ids.length === 1 ? "Student: " : "Students: "}</span>
      {names.slice(0, NAMES_SHOWN).join(", ")}
      {more > 0 && ` and ${more} more`}
    </p>
  );
}

function Priority({ severity, dropped }: { severity: number; dropped: boolean }) {
  const { highSeverityFloor } = useSession();
  const high = !dropped && severityLevel(severity, highSeverityFloor) === "high";
  return (
    <Tag
      className={clsx(high && "border-line-strong bg-surface text-ink")}
      title={`Priority score ${Math.round(severity * 100)} out of 100`}
    >
      {severityLabel(severity, highSeverityFloor)}
    </Tag>
  );
}

/** One thing to do with the class or a student. Cards are for plan actions only. */
export function ActionCard({
  action,
  order,
  changed,
  dropped = false,
}: {
  action: PlannedAction;
  order?: number;
  changed?: PlanChange["kind"];
  dropped?: boolean;
}) {
  const plain = usePlain();
  const highlighted = changed === "added" || changed === "rescheduled";
  return (
    <div
      className={clsx(
        "rounded-md border p-4",
        dropped ? "border-line bg-surface-sunken" : "border-line bg-surface",
        highlighted && "border-agent-line",
      )}
    >
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {order !== undefined && (
          <span className="num grid h-5 w-5 place-items-center rounded-full border border-line-strong text-ink-muted">
            {order}
          </span>
        )}
        <Tag tone={dropped ? "neutral" : "agent"}>{ACTION_LABELS[action.type] ?? action.type}</Tag>
        {changed === "added" && <Tag tone="agent">New</Tag>}
        {changed === "rescheduled" && <Tag tone="agent">Now fits</Tag>}
        <span className="num text-ink-muted ml-auto">{action.cost_minutes} min</span>
      </div>
      <div className={clsx("text-sm font-medium mb-1", dropped ? "text-ink-muted" : "text-ink")}>
        {plain(action.title)}
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Priority severity={action.severity} dropped={dropped} />
        <StudentNames ids={action.learner_ids} />
      </div>
      <p className="text-xs text-ink-muted">
        <span className="text-ink-faint">Why: </span>
        {plain(action.justification)}
      </p>
      {dropped && <p className="mt-2 text-xs text-flag">{plain(dropReasonText(action.drop_reason))}</p>}
      {action.facilitator_script && (
        <Expander label="What to say or do">
          <p className="text-sm text-ink-muted border-l-2 border-line-strong pl-3">
            {plain(action.facilitator_script)}
          </p>
        </Expander>
      )}
    </div>
  );
}

/**
 * Every "check a feedback note" action, folded into one row. Nine cards that say
 * the same thing would bury the actions that differ.
 */
export function FeedbackChecks({
  actions,
  feedback,
  dropped = false,
}: {
  actions: PlannedAction[];
  feedback: DraftedFeedback[];
  dropped?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const plain = usePlain();
  const { patternName } = useSession();
  if (!actions.length) return null;
  const ids = new Set(actions.flatMap((a) => a.learner_ids));
  const notes = feedback.filter((f) => ids.has(f.learner_id));
  const minutes = actions.reduce((sum, a) => sum + a.cost_minutes, 0);
  const title = `Check ${actions.length} feedback ${actions.length === 1 ? "note" : "notes"}`;
  return (
    <div className={clsx("rounded-md border border-line", dropped ? "bg-surface-sunken" : "bg-surface")}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="w-full flex flex-wrap items-center gap-2 px-4 py-3 text-left"
      >
        <Tag tone={dropped ? "neutral" : "agent"}>{ACTION_LABELS.feedback_review}</Tag>
        <span className={clsx("text-sm font-medium", dropped ? "text-ink-muted" : "text-ink")}>
          {title}
        </span>
        <span className="num text-ink-muted ml-auto">{minutes} min</span>
        <span className="text-xs text-ink-muted w-10 text-right">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="border-t border-line px-4 py-3">
          <p className="text-xs text-ink-muted mb-2">
            {dropped
              ? "A note is still drafted for each of these students. Read it before it goes out."
              : "Read each note and change anything that does not sound like you."}
          </p>
          <ul className="divide-y divide-line">
            {notes.map((f) => (
              <li key={f.learner_id} className="py-2">
                <div className="text-sm font-medium text-ink">{f.learner_name}</div>
                {f.node_ids.length > 0 && (
                  <div className="text-xs text-ink-faint">
                    {f.node_ids.map(patternName).join(", ")}
                  </div>
                )}
                <p className="text-sm text-ink-muted mt-0.5">{plain(f.body)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** What moved after a correction, in plain words. A first plan is not a change. */
export function ChangeList({ changes }: { changes: PlanChange[] }) {
  const plain = usePlain();
  const { batch } = useSession();
  const shown = changes.filter((c) => !(c.kind === "added" && !c.action_id));
  if (!shown.length) return null;
  const plan = batch?.plan;
  return (
    <div className="panel border-agent-line">
      <div className="panel-head bg-agent-soft border-agent-line">
        <div>
          <div className="panel-title text-agent">Your correction changed the plan</div>
          <div className="panel-sub text-agent/70">Nothing was marked again.</div>
        </div>
      </div>
      <ul className="divide-y divide-line">
        {shown.map((c, i) => {
          // A change with no action behind it is the count of feedback notes or the minutes.
          const kind = c.action_id ? c.kind : "budget";
          return (
            <li key={i} className="px-4 py-2 flex gap-3 text-sm">
              <Tag
                tone={kind === "added" || kind === "rescheduled" ? "agent" : "neutral"}
                className="shrink-0 self-start mt-0.5"
              >
                {PLAN_CHANGE_PLAIN_LABELS[kind]}
              </Tag>
              <span className="text-ink-muted">
                {c.kind === "budget" && plan
                  ? `You now have ${plan.minutes_used} of ${plan.budget_minutes} minutes planned.`
                  : plain(planChangeTitle(c.detail))}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
