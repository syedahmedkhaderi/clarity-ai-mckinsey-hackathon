import { EscalationQueue } from "../components/EscalationQueue";
import { useAppView } from "../hooks/useAppView";
import { useSession } from "../hooks/useSession";
import { REASON_LABELS } from "../lib/format";
import { PageHeader, RailLink, RailSection, RailStat, WorkSurface } from "../shell/WorkSurface";
import type { ReasonCode } from "../types";
import { BRAND_NAME } from "../lib/brand";

export function ReviewPage() {
  const { batch, resolve, overrideEscalation, openCount } = useSession();
  const { setView } = useAppView();
  if (!batch) return null;
  const open = batch.escalations.filter((e) => !e.resolved);
  const byReason = new Map<ReasonCode, number>();
  for (const e of open) byReason.set(e.reason_code, (byReason.get(e.reason_code) ?? 0) + 1);

  const rail = (
    <>
      <RailSection title="Waiting for you">
        <RailStat label="Open" value={openCount} tone={openCount > 0 ? "flag" : "default"} />
        <RailStat label="Decided" value={batch.escalations.length - open.length} />
      </RailSection>
      {byReason.size > 0 && (
        <RailSection title={`Why ${BRAND_NAME} stopped`}>
          {[...byReason.entries()].map(([code, n]) => (
            <RailStat key={code} label={REASON_LABELS[code]} value={n} />
          ))}
        </RailSection>
      )}
      <RailSection title="Where to go">
        <RailLink
          title="Open the action plan"
          hint="Your decisions here change the plan straight away."
          onClick={() => setView("plan")}
        />
      </RailSection>
      <p className="mt-auto border-t border-line pt-4 text-2xs leading-4 text-ink-muted">
        {BRAND_NAME} never sets a mark that counts. It hands you what it is not sure about.
      </p>
    </>
  );

  return (
    <WorkSurface
      rail={rail}
      header={
        <PageHeader
          title="Needs your call"
          subtitle={`${
            openCount === 0
              ? "Nothing is waiting for you."
              : openCount === 1
                ? "1 thing is waiting for you."
                : `${openCount} things are waiting for you.`
          } Each one shows what the system was unsure about and what it would have done.`}
        />
      }
    >
      <EscalationQueue
        escalations={batch.escalations}
        onResolve={(e) => resolve(e.escalation_id)}
        onOverride={overrideEscalation}
      />
    </WorkSurface>
  );
}
