import type { ReactNode } from "react";
import { OverrideDialog } from "./components/OverrideDialog";
import { AppViewContext, useAppView, useAppViewState, type ViewKey } from "./hooks/useAppView";
import { SessionProvider, useSession } from "./hooks/useSession";
import { ClassPage } from "./pages/ClassPage";
import { HomePage } from "./pages/HomePage";
import { PlanPage } from "./pages/PlanPage";
import { ReviewPage } from "./pages/ReviewPage";
import { StudentsPage } from "./pages/StudentsPage";
import { UploadPage } from "./pages/UploadPage";
import { AppShell } from "./shell/AppShell";

const PAGES: Record<ViewKey, () => ReactNode> = {
  home: () => <HomePage />,
  students: () => <StudentsPage />,
  class: () => <ClassPage />,
  plan: () => <PlanPage />,
  review: () => <ReviewPage />,
  upload: () => <UploadPage />,
};

/** These pages read the analysis, so they have nothing to show before a run. */
const NEEDS_RUN: ViewKey[] = ["students", "class", "plan", "review"];

export default function App() {
  const appView = useAppViewState();
  return (
    <AppViewContext.Provider value={appView}>
      <SessionProvider>
        <Body />
      </SessionProvider>
    </AppViewContext.Provider>
  );
}

function Body() {
  const { view, setView } = useAppView();
  const session = useSession();
  const needsRun = !session.batch && NEEDS_RUN.includes(view);

  return (
    <>
      <AppShell>
        {needsRun ? (
          <div className="panel p-8 text-center">
            <p className="text-sm text-ink-muted">
              Analyse a test first. Go to Home, pick a test and start the analysis.
            </p>
            <button className="btn mt-3" onClick={() => setView("home")}>
              Go to Home
            </button>
          </div>
        ) : (
          PAGES[view]()
        )}
      </AppShell>

      {session.overrideTarget && (
        <OverrideDialog
          target={session.overrideTarget}
          taxonomy={session.taxonomy}
          onCancel={() => session.setOverrideTarget(null)}
          onSubmit={async (newValue, reason) => {
            if (await session.applyOverride(newValue, reason)) setView("plan");
          }}
          busy={session.overrideBusy}
        />
      )}
    </>
  );
}
