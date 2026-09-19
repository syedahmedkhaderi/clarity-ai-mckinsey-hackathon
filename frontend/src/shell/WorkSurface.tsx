import clsx from "clsx";
import { useState, type ReactNode } from "react";

/**
 * A rail on the left and a work area on the right. Only Students uses it: its
 * rail is the list of students it works from, so it earns the column. Every
 * other page puts its summary in a bar across the top instead (TopSurface).
 */
export function WorkSurface({
  rail,
  header,
  children,
  railWidth = "300px",
  railFlush = false,
}: {
  rail: ReactNode;
  header?: ReactNode;
  children: ReactNode;
  railWidth?: string;
  /** For a rail that is a list: no padding, the rows run edge to edge. */
  railFlush?: boolean;
}) {
  return (
    <div
      className="min-h-[calc(100vh-3.5rem)] lg:grid"
      style={{ gridTemplateColumns: `${railWidth} minmax(0, 1fr)` }}
    >
      <aside className="border-b border-line bg-surface lg:sticky lg:top-0 lg:max-h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className={railFlush ? "" : "flex flex-col gap-5 p-4 md:p-5"}>{rail}</div>
      </aside>
      <div className="min-w-0">
        {header}
        <div className="p-4 md:p-6">{children}</div>
      </div>
    </div>
  );
}

/** A plain padded page for the few screens that do not use the rail. */
export function PagePad({ children }: { children: ReactNode }) {
  return <div className="p-4 md:p-6">{children}</div>;
}

export interface TabItem<K extends string> {
  key: K;
  label: string;
  badge?: number;
}

export function PageHeader<K extends string>({
  title,
  subtitle,
  figures,
  action,
  tabs,
  active,
  onTab,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** A few headline numbers shown beside the title. */
  figures?: { label: string; value: ReactNode; tone?: "default" | "flag" }[];
  action?: ReactNode;
  tabs?: TabItem<K>[];
  active?: K;
  onTab?: (key: K) => void;
}) {
  return (
    <div className="border-b border-line bg-surface px-4 pt-4 md:px-6 md:pt-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pb-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
          {subtitle !== undefined && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}
        </div>
        {figures && figures.length > 0 && <Figures items={figures} />}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {tabs && active !== undefined && onTab && <Tabs tabs={tabs} active={active} onTab={onTab} />}
    </div>
  );
}

export function Tabs<K extends string>({
  tabs,
  active,
  onTab,
}: {
  tabs: TabItem<K>[];
  active: K;
  onTab: (key: K) => void;
}) {
  return (
    <div role="tablist" className="-mb-px flex gap-6 overflow-x-auto">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onTab(t.key)}
            className={clsx(
              "flex items-center gap-2 whitespace-nowrap border-b-2 pb-2.5 pt-1 text-sm transition-colors",
              on
                ? "border-agent font-semibold text-ink"
                : "border-transparent font-medium text-ink-muted hover:text-ink",
            )}
          >
            {t.label}
            {t.badge !== undefined && t.badge > 0 && (
              <span className="count-flag">{t.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={clsx("shrink-0", className)}
    >
      <path d="M4.5 2.5 8 6l-3.5 3.5" />
    </svg>
  );
}

/**
 * The layout for pages whose summary sits above the work rather than beside it:
 * the page header, a horizontal bar of key facts and shortcuts, then the work at
 * full width. Students keeps the rail, because its rail is the list it works from.
 */
export function TopSurface({
  header,
  bar,
  children,
}: {
  header?: ReactNode;
  bar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-[calc(100vh-3.5rem)]">
      {header}
      {bar}
      <div className="p-4 md:p-6">{children}</div>
    </div>
  );
}

/**
 * One slim row under the header. The detail a teacher only sometimes wants sits
 * behind a toggle at the end of the row, so the bar never pushes the work down.
 */
export function TopBar({
  children,
  end,
  details,
  detailsLabel = "details",
}: {
  children: ReactNode;
  /** Shortcuts kept together at the right of the row, beside the details toggle. */
  end?: ReactNode;
  details?: ReactNode;
  detailsLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-line bg-surface-raised px-4 md:px-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
        {children}
        {(end !== undefined || details !== undefined) && (
          // Bottom-aligned, so the buttons sit level with a labelled control on the left.
          <div className="ml-auto flex flex-wrap items-center gap-2 self-end">
            {end}
            {details !== undefined && (
              <button
                type="button"
                className="btn"
                aria-expanded={open}
                onClick={() => setOpen(!open)}
              >
                {open ? `Hide ${detailsLabel}` : `Show ${detailsLabel}`}
                <Chevron className={clsx("transition-transform", open ? "-rotate-90" : "rotate-90")} />
              </button>
            )}
          </div>
        )}
      </div>
      {details !== undefined && open && <div className="border-t border-line py-4">{details}</div>}
    </div>
  );
}

/** A thin upright rule between groups in the top bar. */
export function BarDivider() {
  return <span aria-hidden className="hidden h-6 w-px bg-line sm:block" />;
}

/** Headline numbers laid out in a row. */
export function Figures({
  items,
}: {
  items: { label: string; value: ReactNode; tone?: "default" | "flag" }[];
}) {
  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-3">
      {items.map((f) => (
        <div key={f.label}>
          <dt className="text-2xs text-ink-muted">{f.label}</dt>
          <dd
            className={clsx(
              "text-lg font-semibold leading-6 tabular-nums",
              f.tone === "flag" ? "text-flag" : "text-ink",
            )}
          >
            {f.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A shortcut in the top bar: the rail link, folded into one line. The longer
 * explanation stays available as the button's tooltip and accessible name.
 */
export function BarLink({
  title,
  hint,
  tone = "agent",
  count,
  onClick,
}: {
  title: string;
  hint?: string;
  tone?: "agent" | "flag" | "neutral";
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={clsx(
        "inline-flex items-center gap-2 whitespace-nowrap rounded-sm border px-2.5 py-1.5 text-sm font-medium transition-colors",
        tone === "agent" && "border-agent bg-agent-soft text-agent hover:bg-agent-line/50",
        tone === "flag" && "border-flag bg-surface text-flag hover:bg-flag-soft",
        tone === "neutral" && "border-line-strong bg-surface text-ink hover:bg-surface-sunken",
      )}
    >
      {count !== undefined && (
        <span
          className={clsx(
            "grid h-5 min-w-5 place-items-center rounded-sm px-1 font-mono text-xs tabular-nums text-white",
            tone === "flag" ? "bg-flag" : "bg-agent",
          )}
        >
          {count}
        </span>
      )}
      {title}
      <Chevron />
    </button>
  );
}
