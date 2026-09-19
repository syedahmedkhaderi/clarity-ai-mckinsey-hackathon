import { useState } from "react";
import { HowWorkedOut } from "../components/HowWorkedOut";
import { RunProgress } from "../components/RunProgress";
import { TestPicker } from "../components/TestPicker";
import { EmptyState } from "../components/ui/EmptyState";
import { useAppView } from "../hooks/useAppView";
import { useSession } from "../hooks/useSession";
import { analysisLabel, pct } from "../lib/format";
import { PageHeader, RailLink, RailSection, RailStat, WorkSurface } from "../shell/WorkSurface";
import type { BatchResult } from "../types";
import { plural } from "./classStats";
import { MistakesTab, OverviewTab, QuestionsTab, homeStats, type HomeStats } from "./HomeSummary";

type Tab = "overview" | "questions" | "mistakes" | "how";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "questions", label: "Questions" },
  { key: "mistakes", label: "Mistakes" },
  { key: "how", label: "How it was worked out" },
];

/**
 * Home is the work surface for one test: the rail says what matters and where
 * to go, the tabs hold the evidence. Nothing here needs scrolling to find.
 */
export function HomePage() {
  const s = useSession();
  const [tab, setTab] = useState<Tab>("overview");
  const stats = s.batch ? homeStats(s.batch, s.topicName) : null;

  return (
    <WorkSurface
      rail={<Rail stats={stats} />}
      header={s.batch && stats ? <Header batch={s.batch} tab={tab} onTab={setTab} /> : undefined}
    >
      {s.running && (
        <div className="mb-5">
          <RunProgress
            trace={s.trace}
            status={s.status}
            elapsedMs={s.elapsedMs}
            stalledMs={s.stalledMs}
            onCancel={s.cancelRun}
          />
        </div>
      )}
      {s.batch && stats ? (
        <Analysis stats={stats} tab={tab} />
      ) : (
        !s.running && (
          <EmptyState title="No analysis yet">
            Choose a test on the left and press Analyse this test. You will see how the class did
            and what to do next.
          </EmptyState>
        )
      )}
    </WorkSurface>
  );
}

function Header({ batch, tab, onTab }: { batch: BatchResult; tab: Tab; onTab: (t: Tab) => void }) {
  const s = useSession();
  const label = analysisLabel(s.testName(batch.assessment_id), batch.trace[0]?.timestamp);
  return (
    <PageHeader
      title={s.testName(batch.assessment_id)}
      subtitle={
        s.preloaded
          ? `${label}. A worked example from a practice class, so you can look around. Every mark is a draft.`
          : `${label}. Every mark is a draft until you approve it.`
      }
      tabs={TABS}
      active={tab}
      onTab={onTab}
    />
  );
}

function Analysis({ stats, tab }: { stats: HomeStats; tab: Tab }) {
  const s = useSession();
  return (
    <>
      {tab === "overview" && <OverviewTab stats={stats} />}
      {tab === "questions" && <QuestionsTab stats={stats} />}
      {tab === "mistakes" && <MistakesTab stats={stats} />}
      {tab === "how" && (
        <HowWorkedOut
          events={s.trace}
          status={s.status}
          elapsedMs={s.elapsedMs}
          health={s.health}
          running={s.running}
          stage={s.stage}
          open
        />
      )}
    </>
  );
}

/** What a teacher needs at a glance: the test, five numbers, and the two places work is waiting. */
function Rail({ stats }: { stats: HomeStats | null }) {
  const s = useSession();
  const { setView } = useAppView();
  const selected = s.tests.find((t) => t.id === s.selectedTest);
  const planned = s.batch?.plan?.scheduled.length ?? 0;
  return (
    <>
      <TestPicker
        assignments={s.tests}
        selected={s.selectedTest}
        onSelect={s.setSelectedTest}
        onRun={s.run}
        running={s.running}
        blockedReason={selected ? s.runBlockedReason(selected) : null}
      />
      {stats && (
        <RailSection title="This test">
          <RailStat label="Students" value={stats.students} />
          <RailStat label="Marks lost" value={`${stats.lost} of ${stats.possible}`} />
          <RailStat label="Class average" value={`${stats.mean} of ${stats.outOf}`} />
          <RailStat label="Whole-class problems" value={stats.whole.length} />
          <RailStat
            label="Waiting for you"
            value={s.openCount}
            tone={s.openCount > 0 ? "flag" : "default"}
          />
        </RailSection>
      )}
      {stats && (
        <RailSection title="Where to go">
          <div className="flex flex-col gap-2">
            <RailLink
              title="Open the action plan"
              hint={
                planned > 0
                  ? `${plural(planned, "thing")} to do, most marks first.`
                  : "Nothing to plan from this analysis."
              }
              onClick={() => setView("plan")}
            />
            <RailLink
              tone={s.openCount > 0 ? "flag" : "neutral"}
              title={
                s.openCount > 0
                  ? `${plural(s.openCount, "answer")} need${s.openCount === 1 ? "s" : ""} your call`
                  : "Nothing needs your call"
              }
              hint={
                s.openCount > 0
                  ? "Markwise was not sure enough to decide alone."
                  : "It decided everything it was sure about."
              }
              onClick={() => setView("review")}
            />
            {stats.whole.length > 0 && (
              <RailLink
                tone="neutral"
                title={`${stats.whole.length === 1 ? "One" : stats.whole.length} whole-class ${stats.whole.length === 1 ? "problem" : "problems"}`}
                hint={`A mistake made by ${pct(s.sharedThreshold)} or more of the class. See who on the Class page.`}
                onClick={() => setView("class")}
              />
            )}
          </div>
        </RailSection>
      )}
      <div className="mt-auto flex flex-col gap-3 border-t border-line pt-4">
        <button className="btn justify-center" onClick={() => setView("upload")}>
          Add a test
        </button>
        <p className="text-2xs leading-4 text-ink-muted">
          Every mark shown is a draft. Nothing counts until you approve it.
        </p>
      </div>
    </>
  );
}
