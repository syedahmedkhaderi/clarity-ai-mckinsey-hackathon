/**
 * The helper: a pencil with a face and two small arms. Drawn as one inline SVG
 * so it needs no asset and takes its ink from the surrounding text colour. The
 * accent is used for the eraser only.
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

export function Mascot({ size = 48, animated = true }: { size?: number; animated?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="#16181d"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {animated && <style>{CSS}</style>}
      <g className={animated ? "pencil-bob" : undefined}>
        {/* arms, drawn first so the body sits over their roots */}
        <path d="M20 33 C14 34 11 38 11 43" />
        <path d="M44 33 C50 31 53 27 53 22" />
        <circle cx="11" cy="44" r="2" fill="#ffffff" />
        <circle cx="53" cy="21" r="2" fill="#ffffff" />
        {/* eraser and band */}
        <rect x="22" y="4" width="20" height="8" rx="3" fill="#3b4ce0" />
        <rect x="20" y="11" width="24" height="5" fill="#ffffff" />
        {/* body and sharpened end */}
        <path d="M20 16 H44 V44 L32 59 L20 44 Z" fill="#ffffff" />
        <path d="M27.5 53 L32 59 L36.5 53" fill="#16181d" />
        <path d="M20 44 H44" />
        {/* face */}
        <circle className="pencil-eye" cx="27" cy="27" r="1.9" fill="#16181d" stroke="none" />
        <circle className="pencil-eye" cx="37" cy="27" r="1.9" fill="#16181d" stroke="none" />
        <path d="M28 34 Q32 38 36 34" />
      </g>
    </svg>
  );
}
