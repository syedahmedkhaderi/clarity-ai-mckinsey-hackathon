import type { ReactNode } from "react";

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="panel p-8 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {children !== undefined && <p className="text-sm text-ink-muted mt-1">{children}</p>}
      {action !== undefined && <div className="mt-3">{action}</div>}
    </div>
  );
}
