import { EscalationQueue } from "../components/EscalationQueue";
import { useSession } from "../hooks/useSession";

export function ReviewPage() {
  const { batch, resolve, overrideEscalation, openCount } = useSession();
  if (!batch) return null;
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold text-ink">Needs your call</h1>
        <p className="text-sm text-ink-muted mt-0.5">
          {openCount === 0
            ? "Nothing is waiting for you."
            : openCount === 1
              ? "1 thing is waiting for you."
              : `${openCount} things are waiting for you.`}{" "}
          Each one shows what the system was unsure about.
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
