import { EscalationQueue } from "../components/EscalationQueue";
import { useSession } from "../hooks/useSession";

export function ReviewPage() {
  const { batch, resolve, overrideEscalation } = useSession();
  if (!batch) return null;
  const open = batch.escalations.filter((e) => !e.resolved);
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold text-ink">To review</h1>
        <p className="text-sm text-ink-muted mt-0.5">
          {open.length === 1
            ? "1 thing needs your call."
            : `${open.length} things need your call.`}{" "}
          Each one shows both readings the system was weighing and what it would choose if it had
          to.
        </p>
      </header>
      <EscalationQueue
        escalations={batch.escalations}
        onResolve={(e) => resolve(e.escalation_id)}
        onOverride={overrideEscalation}
      />
    </div>
  );
}
