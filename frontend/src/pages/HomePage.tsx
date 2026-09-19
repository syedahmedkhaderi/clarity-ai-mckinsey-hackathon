import { HowWorkedOut } from "../components/HowWorkedOut";
import { RunProgress } from "../components/RunProgress";
import { TestPicker } from "../components/TestPicker";
import { EmptyState } from "../components/ui/EmptyState";
import { useAppView } from "../hooks/useAppView";
import { useSession } from "../hooks/useSession";
import { BRAND_NAME } from "../lib/brand";
import { HomeSummary } from "./HomeSummary";

export function HomePage() {
  const s = useSession();
  const { setView } = useAppView();
  const selected = s.tests.find((t) => t.id === s.selectedTest);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start gap-x-4 gap-y-3 border-b border-line pb-5">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight text-ink">Home</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            {BRAND_NAME} marks a class's answers as drafts, finds the mistake behind each lost mark,
            and tells you what to do about it first.
          </p>
        </div>
        <button className="btn shrink-0" onClick={() => setView("upload")}>
          Add a test
        </button>
      </header>

      <TestPicker
        assignments={s.tests}
        selected={s.selectedTest}
        onSelect={s.setSelectedTest}
        onRun={s.run}
        running={s.running}
        blockedReason={selected ? s.runBlockedReason(selected) : null}
      />

      {s.running && (
        <RunProgress
          trace={s.trace}
          status={s.status}
          elapsedMs={s.elapsedMs}
          stalledMs={s.stalledMs}
          onCancel={s.cancelRun}
        />
      )}

      {s.preloaded && !s.running && (
        <div className="panel border-agent-line bg-agent-soft px-4 py-3">
          <p className="text-sm text-agent">
            This is a worked example, ready so you can look around. It uses sample answers from a
            practice class. Choose a test above and press Analyse this test to run it on your own.
          </p>
        </div>
      )}

      {s.batch ? (
        <HomeSummary batch={s.batch} />
      ) : (
        !s.running && (
          <EmptyState title="No analysis yet">
            Choose a test and press Analyse this test. You will see how the class did and what to do
            next.
          </EmptyState>
        )
      )}

      <HowWorkedOut
        events={s.trace}
        status={s.status}
        elapsedMs={s.elapsedMs}
        health={s.health}
        running={s.running}
        stage={s.stage}
      />
    </div>
  );
}
