import clsx from "clsx";
import { useState } from "react";
import { useSession } from "../../hooks/useSession";
import { PATTERN_KIND_LABELS, pct } from "../../lib/format";
import type { CohortPatterns, LearnerContext, NodePattern } from "../../types";

interface Spot {
  learnerId: string;
  nodeId: string;
}

/**
 * Students down the side, mistake patterns across the top. A solid square is a
 * mistake that keeps happening, a pale one is new this test, and a pattern
 * whose number is highlighted is shared by enough of the class to be a gap in
 * the teaching. Columns carry a number and the names sit in a key underneath,
 * because eighty characters do not fit over a column and rotated text overlaps.
 */
export function ClassHeatmap({
  patterns,
  learners,
  threshold,
  onCell,
  selected,
}: {
  patterns: CohortPatterns;
  learners: LearnerContext[];
  threshold: number;
  onCell: (learnerId: string, nodeId: string) => void;
  selected?: Spot | null;
}) {
  const { plain } = useSession();
  const [spot, setSpot] = useState<Spot | null>(null);
  const columns = patterns.nodes
    .filter((n) => n.kind !== "insufficient_data" && n.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  if (columns.length === 0) {
    return <p className="text-sm text-ink-muted">No mistake patterns were found in this test.</p>;
  }

  const student = (id: string) => learners.find((l) => l.learner_id === id);
  const caption = () => {
    if (!spot) return "Point at a square to read it here. Select it to see the student's answer.";
    const node = columns.find((n) => n.node_id === spot.nodeId);
    const who = student(spot.learnerId);
    if (!node || !who) return "";
    const again = node.recurring_learner_ids.includes(spot.learnerId);
    return `${who.learner_name}: ${node.label}. ${again ? PATTERN_KIND_LABELS.recurring : PATTERN_KIND_LABELS.emerging}.`;
  };

  const hoverNode = spot?.nodeId ?? null;

  return (
    <div>
      <p
        aria-live="polite"
        className={clsx("mb-2 min-h-5 text-xs", spot ? "text-ink" : "text-ink-faint")}
      >
        {caption()}
      </p>

      <div className="overflow-x-auto">
        <table className="w-auto border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-40 border-0 bg-surface p-0 pb-2 align-bottom text-2xs font-medium normal-case tracking-normal text-ink-faint">
                Student
              </th>
              {columns.map((n, i) => (
                <Header key={n.node_id} node={n} index={i + 1} lit={hoverNode === n.node_id} />
              ))}
            </tr>
          </thead>
          <tbody>
            {learners.map((l) => (
              <tr key={l.learner_id}>
                <td className="sticky left-0 z-10 whitespace-nowrap border-0 bg-surface p-0 pr-3 align-middle text-sm text-ink">
                  {l.learner_name}
                  {l.returner && (
                    <span className="ml-1.5 text-2xs text-ink-faint" title={plain(l.note) || undefined}>
                      back after a gap
                    </span>
                  )}
                </td>
                {columns.map((n) => (
                  <Cell
                    key={n.node_id}
                    node={n}
                    learner={l}
                    active={n.learner_ids.includes(l.learner_id)}
                    again={n.recurring_learner_ids.includes(l.learner_id)}
                    chosen={selected?.learnerId === l.learner_id && selected.nodeId === n.node_id}
                    onEnter={() => setSpot({ learnerId: l.learner_id, nodeId: n.node_id })}
                    onLeave={() => setSpot(null)}
                    onCell={onCell}
                  />
                ))}
              </tr>
            ))}
            <tr>
              <td className="sticky left-0 z-10 border-0 bg-surface p-0 pr-3 pt-2 text-2xs text-ink-faint">
                Students with this mistake
              </td>
              {columns.map((n) => (
                <td
                  key={n.node_id}
                  className={clsx(
                    "border-0 p-0 pt-2 text-center num",
                    n.teaching_problem ? "font-semibold text-agent" : "text-ink-muted",
                  )}
                >
                  {n.count}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <ol className="mt-4 grid gap-x-6 gap-y-1 border-t border-line pt-3 sm:grid-cols-2">
        {columns.map((n, i) => (
          <li
            key={n.node_id}
            className={clsx(
              "flex items-baseline gap-2 rounded-[3px] px-1 text-xs",
              hoverNode === n.node_id && "bg-surface-sunken",
            )}
          >
            <span
              className={clsx(
                "num w-5 shrink-0 text-right",
                n.teaching_problem ? "font-semibold text-agent" : "text-ink-faint",
              )}
            >
              {i + 1}
            </span>
            <span className={n.teaching_problem ? "font-semibold text-agent" : "text-ink-muted"}>
              {n.label}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-2xs text-ink-faint">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[2px] bg-agent" />
          Keeps happening: also seen in earlier tests
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[2px] border border-agent-line bg-agent-soft" />
          New this test
        </span>
        <span>
          Highlighted numbers and names are whole-class problems: {pct(threshold)} or more of the class.
        </span>
      </div>
    </div>
  );
}

function Header({ node, index, lit }: { node: NodePattern; index: number; lit: boolean }) {
  return (
    <th
      scope="col"
      title={node.label}
      aria-label={node.label}
      className="w-11 border-0 bg-transparent p-0 px-0.5 pb-1.5 align-bottom font-normal normal-case tracking-normal"
    >
      <div
        className={clsx(
          "mx-auto rounded-[3px] py-0.5 text-center num",
          node.teaching_problem ? "bg-agent-soft font-semibold text-agent" : "text-ink-muted",
          lit && !node.teaching_problem && "bg-surface-sunken text-ink",
        )}
      >
        {index}
      </div>
    </th>
  );
}

function Cell({
  node,
  learner,
  active,
  again,
  chosen,
  onEnter,
  onLeave,
  onCell,
}: {
  node: NodePattern;
  learner: LearnerContext;
  active: boolean;
  again: boolean;
  chosen: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onCell: (learnerId: string, nodeId: string) => void;
}) {
  return (
    <td className="border-0 p-0.5">
      {active ? (
        <button
          type="button"
          onClick={() => onCell(learner.learner_id, node.node_id)}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
          onFocus={onEnter}
          onBlur={onLeave}
          aria-label={`${learner.learner_name}: ${node.label}. ${
            again ? PATTERN_KIND_LABELS.recurring : PATTERN_KIND_LABELS.emerging
          }. Show their answer.`}
          className={clsx(
            "block h-7 w-full rounded-[3px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink",
            again
              ? "bg-agent hover:bg-[#152d50]"
              : "border border-agent-line bg-agent-soft hover:bg-agent-line",
            chosen && "ring-2 ring-ink ring-offset-1",
          )}
        />
      ) : (
        <div aria-hidden className="h-7 w-full rounded-[3px] bg-surface-sunken" />
      )}
    </td>
  );
}
