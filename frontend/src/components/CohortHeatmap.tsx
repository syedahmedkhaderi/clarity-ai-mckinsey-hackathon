import clsx from "clsx";
import { pct } from "../lib/format";
import type { CohortPatterns, LearnerContext } from "../types";

/**
 * Students on one axis, mistake patterns on the other. A column at or above the
 * whole-class line is marked, which is the distinction the class page exists to
 * make.
 */
export function CohortHeatmap({
  patterns,
  learners,
  threshold,
  onCell,
}: {
  patterns: CohortPatterns;
  learners: LearnerContext[];
  threshold: number;
  onCell: (nodeId: string, learnerId: string) => void;
}) {
  const nodes = patterns.nodes.filter((n) => n.kind !== "insufficient_data");
  const ordered = [...nodes].sort((a, b) => b.count - a.count || a.node_id.localeCompare(b.node_id));

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-surface-raised w-44">Student</th>
            {ordered.map((n) => (
              <th key={n.node_id} className="w-11 text-center px-1 align-bottom">
                <div
                  className={clsx(
                    "text-2xs normal-case tracking-normal h-28 mx-auto [writing-mode:vertical-rl] rotate-180 text-left",
                    n.teaching_problem ? "text-agent font-semibold" : "text-ink-muted",
                  )}
                  title={n.label}
                >
                  {n.label}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {learners.map((l) => (
            <tr key={l.learner_id}>
              <td className="sticky left-0 z-10 bg-surface text-sm whitespace-nowrap">
                {l.learner_name}
                {l.returner && (
                  <span className="ml-1.5 text-2xs text-ink-faint" title={l.note ?? undefined}>
                    back after a gap
                  </span>
                )}
              </td>
              {ordered.map((n) => {
                const active = n.learner_ids.includes(l.learner_id);
                const recurring = n.recurring_learner_ids.includes(l.learner_id);
                return (
                  <td key={n.node_id} className="p-0 text-center">
                    <button
                      disabled={!active}
                      onClick={() => onCell(n.node_id, l.learner_id)}
                      title={
                        active
                          ? `${l.learner_name}: ${n.label}${recurring ? ", recurring" : ""}`
                          : undefined
                      }
                      className={clsx(
                        "h-8 w-full transition-colors",
                        !active && "bg-surface",
                        active && !recurring && "bg-agent-soft hover:bg-agent-line",
                        active && recurring && "bg-agent hover:bg-[#3242c9]",
                      )}
                    >
                      {recurring && <span className="text-white text-2xs font-semibold">R</span>}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
          <tr>
            <td className="sticky left-0 z-10 bg-surface-raised text-xs font-medium text-ink-muted">
              Share of class (%)
            </td>
            {ordered.map((n) => (
              <td
                key={n.node_id}
                className={clsx(
                  "text-center num bg-surface-raised",
                  n.teaching_problem ? "text-agent font-semibold" : "text-ink-faint",
                )}
              >
                {Math.round(n.share * 100)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-3 text-2xs text-ink-faint">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-agent-soft border border-agent-line" />
          Found in this test
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-agent" />
          Keeps happening across tests
        </span>
        <span>
          A pattern shared by {pct(threshold)} or more of the class is a whole-class problem, not a
          set of individual ones.
        </span>
      </div>
    </div>
  );
}
