import { useState } from "react";
import type { Assignment } from "../types";

/**
 * Starts a run. The facilitator-minutes input is the hard constraint the planner
 * must respect, so it belongs here rather than buried in settings.
 */
export function BatchRunner({
  assignments,
  selected,
  onSelect,
  minutes,
  onMinutes,
  onRun,
  running,
}: {
  assignments: Assignment[];
  selected: string;
  onSelect: (id: string) => void;
  minutes: number;
  onMinutes: (m: number) => void;
  onRun: () => void;
  running: boolean;
}) {
  const [touched, setTouched] = useState(false);
  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <div className="panel-title">Run LOOP analysis</div>
          <div className="panel-sub">
            Marks are provisional. Nothing here counts until you approve it.
          </div>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th className="w-10"></th>
            <th>Assignment</th>
            <th className="w-28">Topics</th>
            <th className="w-32">Submitted</th>
            <th className="w-20">Marks</th>
          </tr>
        </thead>
        <tbody>
          {assignments.map((a) => (
            <tr
              key={a.id}
              onClick={() => onSelect(a.id)}
              className={selected === a.id ? "bg-agent-soft cursor-pointer" : "cursor-pointer hover:bg-surface-sunken"}
            >
              <td>
                <input
                  type="radio"
                  checked={selected === a.id}
                  onChange={() => onSelect(a.id)}
                  className="accent-agent"
                />
              </td>
              <td>
                <div className="text-sm text-ink">{a.name}</div>
                <div className="text-2xs text-ink-faint">
                  {a.question_count} questions, due {a.due_at.slice(0, 10)}
                </div>
              </td>
              <td className="text-xs text-ink-muted">{a.topics.join(", ")}</td>
              <td className="num text-ink-muted">
                {a.submission_count} of {a.expected_count}
                {a.submission_count < a.expected_count && (
                  <span className="ml-1.5 tag border-line bg-surface-sunken text-ink-faint">
                    {a.expected_count - a.submission_count} absent
                  </span>
                )}
              </td>
              <td className="num text-ink-muted">{a.points_possible}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap items-end gap-4 px-4 py-3 border-t border-line bg-surface-raised">
        <label className="text-xs text-ink-muted">
          <span className="block mb-1">Facilitator time available</span>
          <span className="inline-flex items-center gap-1.5">
            <input
              type="number"
              min={15}
              max={600}
              step={5}
              value={minutes}
              onChange={(e) => {
                setTouched(true);
                onMinutes(Number(e.target.value));
              }}
              className="w-24 rounded border border-line-strong px-2 py-1.5 text-sm num"
            />
            <span className="text-sm text-ink">minutes</span>
          </span>
        </label>
        <p className="text-xs text-ink-faint max-w-md flex-1 min-w-48">
          This is a hard constraint. The planner fills it by severity and reports
          everything it had to leave out.
          {touched && minutes < 60 && (
            <span className="block text-flag mt-0.5">
              Below an hour, expect most of the plan to be dropped.
            </span>
          )}
        </p>
        <button className="btn btn-primary ml-auto" onClick={onRun} disabled={running || !selected}>
          {running ? "Running" : "Run LOOP analysis"}
        </button>
      </div>
    </div>
  );
}
