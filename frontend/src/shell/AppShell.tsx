import clsx from "clsx";
import type { ReactNode } from "react";
import { useAppView, type ViewKey } from "../hooks/useAppView";
import { useSession } from "../hooks/useSession";
import { BRAND_NAME, ORG_NAME } from "../lib/brand";

const NAV: { label: string; key: ViewKey }[] = [
  { label: "Home", key: "home" },
  { label: "Students", key: "students" },
  { label: "Class", key: "class" },
  { label: "Action plan", key: "plan" },
  { label: "To review", key: "review" },
];

/**
 * The institutional wrapper. Deliberately plain: this is the portal a teacher
 * already uses every day, and the pages inside it carry the visual weight.
 * Under 768px the sidebar becomes a row of links along the top.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { view, setView } = useAppView();
  const { health, openCount, error, clearError } = useSession();
  const offline = (health?.provider ?? "offline") === "offline";
  // Adding a test starts from Home, so Home stays lit while the upload page is open.
  const active: ViewKey = view === "upload" ? "home" : view;

  return (
    <div className="min-h-screen">
      <header className="h-14 bg-[#22262e] text-white flex items-center px-4 md:px-5 gap-3">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <span className="text-sm font-semibold tracking-wide">{BRAND_NAME}</span>
          <span className="text-xs text-white/50 truncate">{ORG_NAME}</span>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <span className="text-2xs text-white/50 hidden lg:inline" title={health?.mode}>
            {offline ? "Using the built-in rules only" : "AI is helping"}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/70">Teacher</span>
            <div
              className="h-7 w-7 rounded-full bg-white/15 grid place-items-center text-2xs font-medium"
              aria-hidden="true"
            >
              T
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-col md:flex-row">
        <nav
          aria-label="Main"
          className={clsx(
            "shrink-0 bg-surface border-line",
            "flex overflow-x-auto border-b px-2",
            "md:block md:w-56 md:overflow-visible md:border-b-0 md:border-r md:px-0 md:py-4",
            "md:min-h-[calc(100vh-3.5rem)]",
          )}
        >
          {NAV.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setView(item.key)}
              aria-current={active === item.key ? "page" : undefined}
              className={clsx(
                "whitespace-nowrap text-left px-3 py-2.5 md:py-2 text-sm flex items-center gap-2",
                "md:w-full md:justify-between transition-colors",
                "border-b-2 md:border-b-0 md:border-l-2",
                active === item.key
                  ? "border-ink bg-surface-sunken text-ink font-medium"
                  : "border-transparent text-ink-muted hover:bg-surface-sunken hover:text-ink",
              )}
            >
              {item.label}
              {item.key === "review" && openCount > 0 && (
                <span className="tag border-flag-line bg-flag-soft text-flag num">{openCount}</span>
              )}
            </button>
          ))}
        </nav>

        <main className="flex-1 min-w-0 p-4 md:p-6">
          {error && (
            <div
              role="alert"
              className="panel border-flag-line bg-flag-soft px-4 py-3 mb-5 flex items-start gap-3"
            >
              <p className="text-sm text-flag flex-1">{error}</p>
              <button className="btn btn-xs shrink-0" onClick={clearError}>
                Dismiss
              </button>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
