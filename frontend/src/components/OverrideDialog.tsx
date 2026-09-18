import { useEffect, useMemo, useState } from "react";
import { useSession } from "../hooks/useSession";
import { CORRECTION_EXPLAINER, NOT_A_PATTERN_LABEL } from "../lib/format";
import type { Taxonomy } from "../types";

export interface OverrideTarget {
  type: "diagnosis" | "mark" | "learner_unavailable";
  learnerId: string;
  learnerName?: string;
  questionId?: string;
  currentNode?: string | null;
}

/**
 * The teacher correcting the system. This is the behaviour the product rests
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
  const { questionName } = useSession();
  const nodes = taxonomy?.nodes ?? [];
  const currentLabel = nodes.find((n) => n.id === target.currentNode)?.label ?? target.currentNode;
  const unavailable = target.type === "learner_unavailable";
  const who = target.learnerName ?? "this student";

  // Grouped by topic so a teacher can find a pattern by the maths it belongs to.
  const groups = useMemo(() => {
    const topics = taxonomy?.topics ?? [];
    const known = new Set(topics.map((t) => t.id));
    const listed = topics.map((t) => ({
      id: t.id,
      label: t.label,
      nodes: nodes.filter((n) => n.topic === t.id),
    }));
    const other = nodes.filter((n) => !known.has(n.topic));
    return other.length ? [...listed, { id: "other", label: "Other", nodes: other }] : listed;
  }, [taxonomy, nodes]);

  useEffect(() => {
    if (busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 grid place-items-center p-4 sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="override-title"
        className="panel w-full max-w-lg shadow-lg max-h-full overflow-y-auto"
      >
        <div className="panel-head">
          <div>
            <div id="override-title" className="panel-title">
              {unavailable ? `Mark ${who} as unavailable` : "Correct this finding"}
            </div>
            {!unavailable && (
              <div className="text-xs text-ink-muted mt-0.5">
                {who}, {questionName(target.questionId ?? "")}
              </div>
            )}
            <div className="panel-sub mt-1">{CORRECTION_EXPLAINER}</div>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {target.type === "diagnosis" && (
            <label className="block">
              <span className="block text-xs text-ink-muted mb-1">What it actually is</span>
              <select
                value={node}
                onChange={(e) => setNode(e.target.value)}
                className="w-full rounded border border-line-strong px-2 py-1.5 text-sm bg-surface"
              >
                <option value="">{NOT_A_PATTERN_LABEL}</option>
                {groups.map((g) => (
                  <optgroup key={g.id} label={g.label}>
                    {g.nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {target.currentNode && (
                <span className="block text-2xs text-ink-faint mt-1">
                  The system said: {currentLabel}.
                </span>
              )}
            </label>
          )}

          <label className="block">
            <span className="block text-xs text-ink-muted mb-1">Your reason</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="A sentence is enough. It is saved with your correction."
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
            {busy ? "Saving" : "Save correction"}
          </button>
        </div>
      </div>
    </div>
  );
}
