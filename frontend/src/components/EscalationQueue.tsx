import clsx from "clsx";
import type { Escalation, ReasonCode } from "../types";
import { AGENT_LABELS, REASON_BLURB, REASON_LABELS } from "../lib/format";

/**
 * Escalations grouped by reason code. Each one shows both candidate readings and
 * what the agent would have decided if it had been forced to decide. An
 * escalation that only says "I am unsure" wastes a facilitator's time.
 */
export function EscalationQueue({
  escalations,
  onResolve,
  onOverride,
}: {
  escalations: Escalation[];
  onResolve: (e: Escalation) => void;
  onOverride: (e: Escalation) => void;
}) {
  const groups = escalations.reduce<Record<string, Escalation[]>>((acc, e) => {
    (acc[e.reason_code] ||= []).push(e);
    return acc;
  }, {});
  const codes = Object.keys(groups) as ReasonCode[];

  if (!codes.length) {
    return (
      <div className="panel p-8 text-center">
        <p className="text-sm text-ink-muted">Nothing is waiting for a human decision.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {codes.map((code) => (
        <section key={code} className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title flex items-center gap-2">
                <span className="tag border-flag-line bg-flag-soft text-flag">{code}</span>
                {REASON_LABELS[code]}
              </div>
              <div className="panel-sub">{REASON_BLURB[code]}</div>
            </div>
            <span className="panel-sub">{groups[code].length} waiting</span>
          </div>
          <ul className="divide-y divide-line">
            {groups[code].map((e) => (
              <li key={e.escalation_id} className={clsx("px-4 py-3", e.resolved && "opacity-50")}>
                <div className="flex flex-wrap items-baseline gap-2 mb-1.5">
                  <span className="text-sm font-medium text-ink">{e.subject}</span>
                  <span className="text-2xs text-ink-faint">
                    raised by {AGENT_LABELS[e.raised_by] ?? e.raised_by}
                  </span>
                  {e.resolved && (
                    <span className="tag border-line bg-surface-sunken text-ink-muted">resolved</span>
                  )}
                  {!e.resolved && (
                    <span className="ml-auto flex gap-2">
                      <button className="btn btn-xs" onClick={() => onOverride(e)}>
                        Override
                      </button>
                      <button className="btn btn-xs" onClick={() => onResolve(e)}>
                        Accept agent's call
                      </button>
                    </span>
                  )}
                </div>
                <p className="text-sm text-ink-muted mb-2">{e.reasoning}</p>
                {(e.candidate_a || e.candidate_b) && (
                  <div className="grid gap-2 sm:grid-cols-2 mb-2">
                    <Candidate label="Reading A" value={e.candidate_a} />
                    <Candidate label="Reading B" value={e.candidate_b} />
                  </div>
                )}
                <div className="rounded border border-line bg-surface-sunken px-2.5 py-1.5">
                  <div className="text-2xs uppercase tracking-wide text-ink-faint">
                    What the agent would have decided if forced
                  </div>
                  <p className="text-xs text-ink">{e.would_have_decided}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Candidate({ label, value }: { label: string; value: string | null }) {
  if (!value) return <div />;
  return (
    <div className="rounded border border-line px-2.5 py-1.5">
      <div className="text-2xs uppercase tracking-wide text-ink-faint">{label}</div>
      <p className="text-xs text-ink">{value}</p>
    </div>
  );
}
