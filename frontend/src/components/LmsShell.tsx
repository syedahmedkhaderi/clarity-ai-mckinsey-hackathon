import clsx from "clsx";
import type { ReactNode } from "react";

export type ViewKey = "dashboard" | "learners" | "cohort" | "plan" | "queue";

const LMS_NAV = [
  { label: "Courses", key: null },
  { label: "Assignments", key: null },
  { label: "Gradebook", key: null },
  { label: "People", key: null },
  { label: "Files", key: null },
];

const LOOP_NAV: { label: string; key: ViewKey }[] = [
  { label: "Run and trace", key: "dashboard" },
  { label: "Learners", key: "learners" },
  { label: "Cohort", key: "cohort" },
  { label: "Intervention plan", key: "plan" },
  { label: "Review queue", key: "queue" },
];

/**
 * The institutional wrapper. Deliberately plain: this is the learning portal a
 * facilitator already uses every day. LOOP is a module inside it, and its own
 * panels carry the visual weight.
 */
export function LmsShell({
  view,
  onNavigate,
  queueCount,
  mode,
  children,
}: {
  view: ViewKey;
  onNavigate: (v: ViewKey) => void;
  queueCount: number;
  mode: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="h-14 bg-[#22262e] text-white flex items-center px-5 gap-4">
        <div className="flex items-center gap-2.5">
          <div className="h-6 w-6 rounded-sm bg-white/15 grid place-items-center text-2xs font-semibold tracking-wider">
            MF
          </div>
          <span className="text-sm font-medium">Meridian Foundation</span>
        </div>
        <span className="text-white/30">/</span>
        <span className="text-sm text-white/70">Learning Portal</span>
        <div className="ml-auto flex items-center gap-4">
          <span className="text-2xs text-white/50 hidden sm:inline">
            LOOP {mode === "model" ? "model mode" : "offline mode"}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/70 hidden sm:inline">N. Okonkwo, Facilitator</span>
            <div className="h-7 w-7 rounded-full bg-white/15 grid place-items-center text-2xs font-medium">
              NO
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        <nav className="w-56 shrink-0 border-r border-line bg-surface min-h-[calc(100vh-3.5rem)] py-4">
          <div className="px-3 pb-2 text-2xs font-semibold uppercase tracking-wider text-ink-faint">
            Centre 4, Maths
          </div>
          {LMS_NAV.map((item) => (
            <button
              key={item.label}
              disabled
              className="w-full text-left px-3 py-1.5 text-sm text-ink-faint cursor-default"
            >
              {item.label}
            </button>
          ))}

          <div className="mt-5 px-3 pb-2 text-2xs font-semibold uppercase tracking-wider text-agent">
            LOOP
          </div>
          {LOOP_NAV.map((item) => (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={clsx(
                "w-full text-left px-3 py-1.5 text-sm flex items-center justify-between",
                "border-l-2 transition-colors",
                view === item.key
                  ? "border-agent bg-agent-soft text-agent font-medium"
                  : "border-transparent text-ink hover:bg-surface-sunken",
              )}
            >
              {item.label}
              {item.key === "queue" && queueCount > 0 && (
                <span className="tag border-flag-line bg-flag-soft text-flag">{queueCount}</span>
              )}
            </button>
          ))}
        </nav>

        <main className="flex-1 min-w-0 p-6">{children}</main>
      </div>
    </div>
  );
}
