/**
 * The helper: a pencil with a face and two small arms. Drawn as one inline SVG
 * so it needs no asset. On the dark helper button the arms and eraser, which sit
 * outside the white body, switch to light strokes so they do not disappear.
 */
const CSS = `
.pencil-bob { animation: pencil-bob 4.5s ease-in-out infinite; }
.pencil-eye { transform-box: fill-box; transform-origin: center; animation: pencil-blink 5.5s infinite; }
@keyframes pencil-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-1.5px); } }
@keyframes pencil-blink { 0%, 94%, 100% { transform: scaleY(1); } 97% { transform: scaleY(0.1); } }
@media (prefers-reduced-motion: reduce) {
  .pencil-bob, .pencil-eye { animation: none; }
}
`;

export function Mascot({
  size = 48,
  animated = true,
  onDark = false,
}: {
  size?: number;
  animated?: boolean;
  onDark?: boolean;
}) {
  const limb = onDark ? "#ffffff" : "#151a22";
  const eraser = onDark ? "#9fb6d6" : "#1d3d6b";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="#151a22"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {animated && <style>{CSS}</style>}
      <g className={animated ? "pencil-bob" : undefined}>
        {/* arms, drawn first so the body sits over their roots */}
        <path d="M20 33 C14 34 11 38 11 43" stroke={limb} />
        <path d="M44 33 C50 31 53 27 53 22" stroke={limb} />
        <circle cx="11" cy="44" r="2" fill="#ffffff" stroke={limb} />
        <circle cx="53" cy="21" r="2" fill="#ffffff" stroke={limb} />
        {/* eraser and band */}
        <rect x="22" y="4" width="20" height="8" rx="3" fill={eraser} />
        <rect x="20" y="11" width="24" height="5" fill="#ffffff" />
        {/* body and sharpened end */}
        <path d="M20 16 H44 V44 L32 59 L20 44 Z" fill="#ffffff" />
        <path d="M27.5 53 L32 59 L36.5 53" fill="#151a22" />
        <path d="M20 44 H44" />
        {/* face */}
        <circle className="pencil-eye" cx="27" cy="27" r="1.9" fill="#151a22" stroke="none" />
        <circle className="pencil-eye" cx="37" cy="27" r="1.9" fill="#151a22" stroke="none" />
        <path d="M28 34 Q32 38 36 34" />
      </g>
    </svg>
  );
}
