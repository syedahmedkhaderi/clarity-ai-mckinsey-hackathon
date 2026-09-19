import clsx from "clsx";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

export interface SelectOption {
  value: string;
  label: string;
  /** Grey text after the label on the control and in the menu: the full name. */
  detail?: string;
  /** Second line in the menu: when it was analysed, when it was added. */
  sub?: string;
  /** Right-aligned in the menu: how many sheets are in. */
  meta?: string;
  /** Rust when the meta is a problem, such as sheets still missing. */
  metaTone?: "default" | "flag";
  disabled?: boolean;
}

export interface SelectGroup {
  label?: string;
  options: SelectOption[];
}

/**
 * A select that says more than a native one can: each row carries a second
 * line and a count, and the control shows the chosen item's full name. It is
 * a button plus a listbox, with the keyboard handling a native select has.
 */
export function Select({
  id,
  label,
  value,
  groups,
  onChange,
  disabled = false,
  className,
}: {
  id: string;
  label: string;
  value: string;
  groups: SelectGroup[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const flat = groups.flatMap((g) => g.options);
  const chosen = flat.find((o) => o.value === value);
  const [active, setActive] = useState(() => Math.max(0, flat.findIndex((o) => o.value === value)));
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const show = () => {
    setActive(Math.max(0, flat.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const choose = (o: SelectOption) => {
    if (o.disabled) return;
    onChange(o.value);
    setOpen(false);
  };
  const step = (by: number) => {
    let i = active;
    for (let n = 0; n < flat.length; n += 1) {
      i = (i + by + flat.length) % flat.length;
      if (!flat[i].disabled) break;
    }
    setActive(i);
  };

  const onKey = (e: KeyboardEvent) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      show();
      return;
    }
    if (!open) return;
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") step(1);
    else if (e.key === "ArrowUp") step(-1);
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(flat.length - 1);
    else if (e.key === "Enter" || e.key === " ") choose(flat[active]);
    else if (e.key === "Tab") setOpen(false);
    else return;
    e.preventDefault();
  };

  return (
    <div ref={root} className={clsx("relative", className)}>
      <span id={`${id}-label`} className="block text-2xs font-medium uppercase tracking-wide text-ink-muted">
        {label}
      </span>
      <button
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${id}-label ${id}`}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKey}
        className={clsx(
          "mt-1.5 flex h-9 w-full items-center justify-between gap-2 rounded-sm border bg-surface px-2.5 text-left text-sm",
          "outline-none transition-colors focus-visible:border-ink focus-visible:ring-1 focus-visible:ring-ink",
          open ? "border-ink" : "border-line-strong",
          "disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        <span className="min-w-0 truncate">
          <span className="font-semibold text-ink">{chosen?.label ?? "Choose"}</span>
          {chosen?.detail && <span className="text-ink-muted"> {chosen.detail}</span>}
        </span>
        <UpDown />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={`${id}-label`}
          className="absolute left-0 right-0 z-30 mt-1 max-h-80 overflow-y-auto rounded-sm border border-line-strong bg-surface py-1 shadow-[0_4px_12px_rgba(21,26,34,0.08)]"
        >
          {groups.map((g, gi) => (
            <li key={g.label ?? gi} role="presentation">
              {g.label && (
                <p
                  className={clsx(
                    "px-2.5 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wider text-ink-muted",
                    gi > 0 && "mt-1 border-t border-line",
                  )}
                >
                  {g.label}
                </p>
              )}
              <ul role="group" aria-label={g.label}>
                {g.options.map((o) => {
                  const i = flat.indexOf(o);
                  const on = o.value === value;
                  return (
                    <li
                      key={o.value}
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={on}
                      aria-disabled={o.disabled}
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(o)}
                      className={clsx(
                        "grid cursor-pointer grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-2.5 px-2.5 py-2",
                        i === active && "bg-surface-sunken",
                        on && "bg-agent-soft",
                        o.disabled && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <span className="grid place-items-center text-agent">{on && <Check />}</span>
                      <span className="min-w-0">
                        <span className={clsx("block truncate text-sm", on ? "font-semibold" : "font-medium")}>
                          {o.label}
                          {o.detail && <span className="font-normal text-ink-muted"> {o.detail}</span>}
                        </span>
                        {o.sub && <span className="block text-2xs text-ink-muted">{o.sub}</span>}
                      </span>
                      {o.meta && (
                        <span
                          className={clsx(
                            "text-2xs tabular-nums",
                            o.metaTone === "flag" ? "font-medium text-flag" : "text-ink-muted",
                          )}
                        >
                          {o.meta}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UpDown() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-ink"
    >
      <path d="M3.5 4.5 6 2l2.5 2.5M3.5 7.5 6 10l2.5-2.5" />
    </svg>
  );
}

function Check() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 6.5 5 9l4.5-6" />
    </svg>
  );
}
