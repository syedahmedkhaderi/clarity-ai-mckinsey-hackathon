import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * The bordered container every page is built from. `flush` drops the body
 * padding for panels that hold a table edge to edge.
 */
export function Panel({
  title,
  subtitle,
  action,
  tone = "default",
  flush = false,
  className,
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  tone?: "default" | "agent" | "flag";
  flush?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const hasHead = title !== undefined || subtitle !== undefined || action !== undefined;
  return (
    <section
      className={clsx(
        "panel",
        tone === "agent" && "border-agent-line",
        tone === "flag" && "border-flag-line",
        className,
      )}
    >
      {hasHead && (
        <div
          className={clsx(
            "panel-head",
            tone === "agent" && "bg-agent-soft border-agent-line",
            tone === "flag" && "bg-flag-soft border-flag-line",
          )}
        >
          <div className="min-w-0">
            {title !== undefined && (
              <div
                className={clsx(
                  "panel-title",
                  tone === "agent" && "text-agent",
                  tone === "flag" && "text-flag",
                )}
              >
                {title}
              </div>
            )}
            {subtitle !== undefined && <div className="panel-sub">{subtitle}</div>}
          </div>
          {action}
        </div>
      )}
      {children !== undefined && <div className={flush ? "" : "p-4"}>{children}</div>}
    </section>
  );
}
