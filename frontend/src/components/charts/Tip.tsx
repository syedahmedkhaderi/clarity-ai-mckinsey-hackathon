import clsx from "clsx";
import type { CSSProperties, ReactNode } from "react";

/**
 * A tooltip that opens on hover and on keyboard focus, so a chart mark reads the
 * same for someone using a mouse and someone using the Tab key. The wrapper is
 * the focus target; `label` is what a screen reader hears. The caller must give it
 * a position (`relative` or `absolute`) so the tooltip can anchor to it.
 */
export function Tip({
  text,
  label,
  className,
  style,
  children,
}: {
  text: string;
  label?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <span
      tabIndex={0}
      role="img"
      aria-label={label ?? text}
      style={style}
      className={clsx(
        "group rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-faint",
        className,
      )}
    >
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 hidden w-max max-w-[14rem] -translate-x-1/2 rounded bg-ink px-2 py-1 text-center text-2xs font-normal normal-case tracking-normal text-white group-hover:block group-focus:block"
      >
        {text}
      </span>
    </span>
  );
}
