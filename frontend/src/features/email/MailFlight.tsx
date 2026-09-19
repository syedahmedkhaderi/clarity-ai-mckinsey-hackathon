import { Tick } from "../../components/ui/Tick";
import type { SendResult } from "../../types/email";

/**
 * What the teacher sees once a note has gone. A delivered note flies off along its
 * trail. A note that was only saved, because Gmail is not set up, settles into the
 * outbox instead, so the picture never claims a delivery that did not happen. The
 * words underneath are the server's own sentence either way.
 */
export function MailFlight({ result, name }: { result: SendResult; name: string }) {
  const delivered = result.status === "delivered";
  return (
    <div className="flex flex-col items-center py-6 text-center">
      <div className="relative h-36 w-72" aria-hidden>
        {delivered ? (
          <>
            {/* The trail fades once the envelope has gone, so no stray line is left behind. */}
            <svg
              viewBox="0 0 288 144"
              className="anim-fade-out absolute inset-0 h-full w-full overflow-visible"
              style={{ animationDelay: "1300ms" }}
            >
              <path
                d="M112 104 C 160 100, 200 70, 280 0"
                fill="none"
                pathLength={1}
                strokeWidth="2"
                strokeLinecap="round"
                className="anim-draw stroke-agent-line"
                style={{ animationDelay: "250ms" }}
              />
            </svg>
            <div className="anim-fly absolute left-[76px] top-[74px]">
              <Envelope />
            </div>
          </>
        ) : (
          <>
            {/* Centred by the outer box, because the animation owns the inner one's transform. */}
            <div className="absolute left-1/2 top-[48px] -translate-x-1/2">
              <div className="anim-settle">
                <Envelope />
              </div>
            </div>
            <svg viewBox="0 0 288 144" className="absolute inset-0 h-full w-full">
              <path
                d="M92 96 v26 h104 v-26"
                fill="none"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-line-strong"
              />
            </svg>
          </>
        )}
      </div>
      <p
        role="status"
        className="anim-rise mt-2 inline-flex items-center gap-2 text-base font-semibold text-ink"
        style={{ animationDelay: delivered ? "900ms" : "500ms" }}
      >
        <Tick size={20} delay={delivered ? 900 : 500} />
        {delivered ? `Sent to ${name}` : `Saved for ${name}, not delivered`}
      </p>
      <p
        className="anim-fade mt-1 max-w-md text-sm text-ink-muted"
        style={{ animationDelay: delivered ? "1100ms" : "700ms" }}
      >
        {result.message}
      </p>
    </div>
  );
}

function Envelope() {
  return (
    <svg width="72" height="50" viewBox="0 0 72 50" className="block">
      <rect x="1.5" y="1.5" width="69" height="47" rx="4" className="fill-surface stroke-agent" strokeWidth="3" />
      <path
        d="M3 4 L36 29 L69 4"
        fill="none"
        strokeWidth="3"
        strokeLinejoin="round"
        className="stroke-agent"
      />
      <path d="M3 46 L27 24 M69 46 L45 24" fill="none" strokeWidth="2" className="stroke-agent-line" />
    </svg>
  );
}
