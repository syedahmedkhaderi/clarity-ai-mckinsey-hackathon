import { EscalationQueue } from "../components/EscalationQueue";
import { useAppView } from "../hooks/useAppView";
import { useSession } from "../hooks/useSession";
import { REASON_LABELS } from "../lib/format";
import { BarDivider, BarLink, PageHeader, TopBar, TopSurface } from "../shell/WorkSurface";
import type { ReasonCode } from "../types";
import { BRAND_NAME } from "../lib/brand";

export function ReviewPage() {
  const { batch, resolve, overrideEscalation, openCount } = useSession();
  const { setView } = useAppView();
  if (!batch) return null;
  const open = batch.escalations.filter((e) => !e.resolved);
  const byReason = new Map<ReasonCode, number>();
  for (const e of open) byReason.set(e.reason_code, (byReason.get(e.reason_code) ?? 0) + 1);

  const bar = (
    <TopBar>
      <span className="text-sm text-ink-muted">
        <span className={openCount > 0 ? "num font-semibold text-flag" : "num font-semibold text-ink"}>
          {openCount}
        </span>{" "}
        open,{" "}
        <span className="num font-semibold text-ink">{batch.escalations.length - open.length}</span>{" "}
        decided.
      </span>
      {byReason.size > 0 && (
        <>
          <BarDivider />
          <span className="text-xs text-ink-muted">Why {BRAND_NAME} stopped:</span>
          {[...byReason.entries()].map(([code, n]) => (
            <span
              key={code}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs text-ink"
            >
              {REASON_LABELS[code]}
              <span className="num text-ink-muted">{n}</span>
            </span>
          ))}
        </>
      )}
      <span className="ml-auto">
        <BarLink
          title="Open the action plan"
          hint="Your decisions here change the plan straight away."
          onClick={() => setView("plan")}
        />
      </span>
    </TopBar>
  );

  return (
    <TopSurface
      bar={bar}
      header={
        <PageHeader
          title="Needs your call"
          subtitle={`${
            openCount === 0
              ? "Nothing is waiting for you."
              : openCount === 1
                ? "1 thing is waiting for you."
                : `${openCount} things are waiting for you.`
          } Each one shows what the system was unsure about and what it would have done. ${BRAND_NAME} never sets a mark that counts.`}
        />
      }
    >
      <EscalationQueue
        escalations={batch.escalations}
        onResolve={(e) => resolve(e.escalation_id)}
        onOverride={overrideEscalation}
      />
    </TopSurface>
  );
}
