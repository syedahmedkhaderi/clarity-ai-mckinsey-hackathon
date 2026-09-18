import type { BatchResult, Escalation } from "../types";
import { EscalationQueue } from "../components/EscalationQueue";

export function QueueView({
  batch,
  onResolve,
  onOverride,
}: {
  batch: BatchResult;
  onResolve: (e: Escalation) => void;
  onOverride: (e: Escalation) => void;
}) {
  const open = batch.escalations.filter((e) => !e.resolved);
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold text-ink">Review queue</h1>
        <p className="text-sm text-ink-muted mt-0.5">
          {open.length} decisions the agent declined to make alone. Each one names both readings
          it was weighing and what it would have chosen if it had been forced to choose.
        </p>
      </header>
      <EscalationQueue
        escalations={batch.escalations}
        onResolve={onResolve}
        onOverride={onOverride}
      />
    </div>
  );
}
