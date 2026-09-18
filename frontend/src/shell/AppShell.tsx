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
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { view, setView } = useAppView();
  const { health, openCount, error, clearError } = useSession();
  const offline = (health?.provider ?? "offline") === "offline";
  // Adding a test starts from Home, so Home stays lit while the upload page is open.
  const active: ViewKey = view === "upload" ? "home" : view;

  return (
    <div className="min-h-screen">
      <header className="h-14 bg-[#22262e] text-white flex items-center px-5 gap-4">
        <div className="flex items-center gap-2.5">
          <div className="h-6 w-6 rounded-sm bg-white/15 grid place-items-center text-2xs font-semibold tracking-wider">
            MF
          </div>
          <span className="text-sm font-medium">{ORG_NAME}</span>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <span className="text-2xs text-white/50 hidden md:inline" title={health?.mode}>
            {offline ? "Using the built-in rules only" : "AI is helping"}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/70 hidden sm:inline">Teacher</span>
            <div className="h-7 w-7 rounded-full bg-white/15 grid place-items-center text-2xs font-medium">
              T
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        <nav className="w-56 shrink-0 border-r border-line bg-surface min-h-[calc(100vh-3.5rem)] py-4">
          <div className="px-3 pb-2 text-2xs font-semibold uppercase tracking-wider text-ink-faint">
            {BRAND_NAME}
          </div>
          {NAV.map((item) => (
            <button
              key={item.key}
              onClick={() => setView(item.key)}
              className={clsx(
                "w-full text-left px-3 py-1.5 text-sm flex items-center justify-between",
                "border-l-2 transition-colors",
                active === item.key
                  ? "border-ink bg-surface-sunken text-ink font-medium"
                  : "border-transparent text-ink-muted hover:bg-surface-sunken",
              )}
            >
              {item.label}
              {item.key === "review" && openCount > 0 && (
                <span className="tag border-flag-line bg-flag-soft text-flag">{openCount}</span>
              )}
            </button>
          ))}
        </nav>

        <main className="flex-1 min-w-0 p-6">
          {error && (
            <div className="panel border-flag-line bg-flag-soft px-4 py-3 mb-5 flex items-start gap-3">
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
