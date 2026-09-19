import { useEffect, useState } from "react";

const DURATION_MS = 700;

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Counts the leading whole number of a figure up from zero, so "5 of 12" or
 * "42%" arrives rather than appears. Anything without a leading whole number is
 * shown as it is. The accessible text is always the final value.
 */
export function CountUp({ value }: { value: string }) {
  const match = /^(\d+)(.*)$/s.exec(value);
  const target = match ? Number(match[1]) : 0;
  const rest = match ? match[2] : "";
  const [shown, setShown] = useState(() => (match && !reducedMotion() ? 0 : target));

  useEffect(() => {
    if (!match || reducedMotion()) {
      setShown(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(target * eased));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // Only a new number restarts the count; the same figure on a re-render does not.
  }, [target]);

  if (!match) return <>{value}</>;
  return (
    <>
      <span className="sr-only">{value}</span>
      <span aria-hidden>
        {shown}
        {rest}
      </span>
    </>
  );
}
