import clsx from "clsx";

/** A filled circle that pops in and a check that draws itself: the sign that something is done. */
export function Tick({
  size = 18,
  delay = 0,
  className,
}: {
  size?: number;
  /** For a tick that appears inside something still arriving, so it lands once visible. */
  delay?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={clsx("shrink-0", className)}
    >
      <circle
        cx="12"
        cy="12"
        r="11"
        className="anim-pop fill-agent"
        style={{ transformBox: "fill-box", transformOrigin: "center", animationDelay: `${delay}ms` }}
      />
      <path
        d="M7 12.5l3.2 3.2L17 9"
        fill="none"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        className="anim-draw-fast"
        style={{ animationDelay: `${delay + 180}ms` }}
      />
    </svg>
  );
}
