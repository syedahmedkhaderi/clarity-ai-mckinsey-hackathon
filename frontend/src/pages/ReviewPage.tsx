import { EscalationQueue } from "../components/EscalationQueue";
import { useSession } from "../hooks/useSession";
import { PagePad } from "../shell/WorkSurface";

export function ReviewPage() {
  const { batch, resolve, overrideEscalation, openCount } = useSession();
  if (!batch) return null;
  return (
    <PagePad>
      <div className="space-y-6">
        <header className="border-b border-line pb-5">
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            Needs your call
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
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
    </PagePad>
  );
}
