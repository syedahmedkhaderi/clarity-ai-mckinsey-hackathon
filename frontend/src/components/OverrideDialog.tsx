import { useState } from "react";
import type { Taxonomy } from "../types";

export interface OverrideTarget {
  type: "diagnosis" | "mark" | "learner_unavailable";
  learnerId: string;
  questionId?: string;
  currentNode?: string | null;
}

/**
 * The facilitator correcting the agent. This is the behaviour the product rests
 * on, so the dialog says plainly what will happen next.
 */
export function OverrideDialog({
  target,
  taxonomy,
  onCancel,
  onSubmit,
  busy,
}: {
  target: OverrideTarget;
  taxonomy: Taxonomy | null;
  onCancel: () => void;
  onSubmit: (newValue: string | null, reason: string) => void;
  busy: boolean;
}) {
  const [node, setNode] = useState<string>("");
  const [reason, setReason] = useState("");
  const nodes = taxonomy?.nodes ?? [];

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 grid place-items-center p-6">
      <div className="panel w-full max-w-lg shadow-lg">
        <div className="panel-head">
          <div>
            <div className="panel-title">
              {target.type === "learner_unavailable"
                ? `Mark ${target.learnerId} unavailable`
                : `Override the diagnosis on ${target.questionId}`}
            </div>
            <div className="panel-sub">
              LOOP will take your correction as fact, recompute the cohort picture underneath it
              and rebuild the plan. Marks below this point are not re-run.
            </div>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {target.type === "diagnosis" && (
            <label className="block">
              <span className="block text-xs text-ink-muted mb-1">
                What it actually is
              </span>
              <select
                value={node}
                onChange={(e) => setNode(e.target.value)}
                className="w-full rounded border border-line-strong px-2 py-1.5 text-sm bg-surface"
              >
                <option value="">Not a misconception at all, remove it</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.id} {n.label}
                  </option>
                ))}
              </select>
              {target.currentNode && (
                <span className="block text-2xs text-ink-faint mt-1">
                  The agent said {target.currentNode}.
                </span>
              )}
            </label>
          )}

          <label className="block">
            <span className="block text-xs text-ink-muted mb-1">
              Why, in your own words
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="This is recorded against the override so the next facilitator can see your reasoning."
              className="w-full rounded border border-line-strong px-2 py-1.5 text-sm resize-none"
            />
          </label>
        </div>

        <div className="px-4 py-3 border-t border-line flex justify-end gap-2 bg-surface-raised">
          <button className="btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => onSubmit(node || null, reason)}
            disabled={busy}
          >
            {busy ? "Re-planning" : "Apply and re-plan"}
          </button>
        </div>
      </div>
    </div>
  );
}
