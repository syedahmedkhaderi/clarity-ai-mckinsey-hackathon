import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * The layout every LOOP page shares: a summary rail on the left that answers
 * "what matters here" at a glance, and a work area on the right with a header
 * bar and, where a page has more than one view, a row of tabs. The rail stays
 * in view while the work area scrolls, so the key numbers never leave the screen.
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
        {figures && figures.length > 0 && (
          <dl className="flex flex-wrap gap-x-7 gap-y-2">
            {figures.map((f) => (
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
        )}
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

/** One line of the rail: a label and a number. */
export function RailStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "flag";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span
        className={clsx(
          "text-base font-semibold tabular-nums",
          tone === "flag" ? "text-flag" : "text-ink",
        )}
      >
        {value}
      </span>
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
 * A rail shortcut to the page where the work happens. Agent blue for the plan;
 * the flag tone is a rust outline with the count in a solid square, for things
 * waiting on the teacher.
 */
export function RailLink({
  title,
  hint,
  tone = "agent",
  count,
  onClick,
}: {
  title: string;
  hint: string;
  tone?: "agent" | "flag" | "neutral";
  /** Shown as a solid square before the title. Meant for the flag tone. */
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex w-full items-center gap-3 rounded-sm border px-3 py-2.5 text-left transition-colors",
        tone === "agent" && "border-agent bg-agent-soft hover:bg-agent-line/50",
        tone === "flag" && "border-flag bg-surface hover:bg-flag-soft",
        tone === "neutral" && "border-line bg-surface hover:bg-surface-sunken",
      )}
    >
      {count !== undefined && (
        <span
          className={clsx(
            "grid h-8 w-8 shrink-0 place-items-center rounded-sm font-mono text-[15px] font-medium tabular-nums",
            tone === "flag" ? "bg-flag text-white" : "bg-agent text-white",
          )}
        >
          {count}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span
          className={clsx(
            "block text-sm font-semibold",
            tone === "agent" && "text-agent",
            tone === "flag" && "text-flag",
            tone === "neutral" && "text-ink",
          )}
        >
          {title}
        </span>
        <span className="mt-0.5 block text-xs text-ink-muted">{hint}</span>
      </span>
      <Chevron
        className={clsx(
          tone === "agent" && "text-agent",
          tone === "flag" && "text-flag",
          tone === "neutral" && "text-ink-muted",
        )}
      />
    </button>
  );
}

export function RailSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section>
      {title && (
        <p className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-ink-muted">{title}</p>
      )}
      {children}
    </section>
  );
}
