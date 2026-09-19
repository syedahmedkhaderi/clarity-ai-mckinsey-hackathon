import { useState, type ReactNode } from "react";

/**
 * A panel whose body is hidden until asked for. Uncontrolled by default; pass
 * `open` and `onToggle` to drive it from outside.
 */
export function Collapsible({
  title,
  hint,
  defaultOpen = false,
  open,
  onToggle,
  children,
}: {
  title: string;
  hint?: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  children: ReactNode;
}) {
  const [inner, setInner] = useState(defaultOpen);
  const isOpen = open ?? inner;
  const toggle = () => {
    setInner(!isOpen);
    onToggle?.(!isOpen);
  };
  return (
    <section className="panel">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        className="w-full px-4 py-3 flex items-baseline gap-3 text-left rounded-md bg-surface-raised hover:bg-surface-sunken"
      >
        <span className="panel-title">{title}</span>
        {hint !== undefined && <span className="panel-sub">{hint}</span>}
        <span className="ml-auto text-xs text-ink-muted">{isOpen ? "Hide" : "Show"}</span>
      </button>
      {isOpen && <div className="border-t border-line p-4 space-y-5">{children}</div>}
    </section>
  );
}
