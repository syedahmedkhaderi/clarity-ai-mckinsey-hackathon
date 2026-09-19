import { HowWorkedOut } from "../components/HowWorkedOut";
import { RunProgress } from "../components/RunProgress";
import { TestPicker } from "../components/TestPicker";
import { EmptyState } from "../components/ui/EmptyState";
import { useAppView } from "../hooks/useAppView";
import { useSession } from "../hooks/useSession";
import { analysisLabel, marksLabel, pct } from "../lib/format";
import { BarLink, Figures, TopBar, TopSurface } from "../shell/WorkSurface";
import { plural } from "./classStats";
import { OverviewTab, homeStats, type HomeStats } from "./HomeSummary";
import { BRAND_NAME } from "../lib/brand";

/**
 * Home is the overview of one test. One bar across the top chooses the test;
 * the facts about it stay folded away until asked for, so the charts get the
 * screen. Where to go next comes after the charts, once the teacher has read them.
 */
export function HomePage() {
  const s = useSession();
  const stats = s.batch ? homeStats(s.batch, s.topicName) : null;

  return (
    <TopSurface bar={<Bar stats={stats} />}>
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
      {stats ? (
        <>
          <OverviewTab stats={stats} />
          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-5">
            <span className="mr-2 text-sm font-medium text-ink">Next:</span>
            <Links stats={stats} />
          </div>
        </>
      ) : (
        !s.running && (
          <EmptyState title="No analysis yet">
            Choose a test above and press Analyse this test. You will see how the class did and
            what to do next.
          </EmptyState>
        )
      )}
    </TopSurface>
  );
}

/** The test and the button to analyse it, with its facts behind a toggle. */
function Bar({ stats }: { stats: HomeStats | null }) {
  const s = useSession();
  const { setView } = useAppView();
  const selected = s.tests.find((t) => t.id === s.selectedTest);
  return (
    <TopBar
      details={<Details stats={stats} />}
      detailsLabel="test details"
      end={
        <button className="pill" onClick={() => setView("upload")}>
          Add a test
        </button>
      }
    >
      <TestPicker
        assignments={s.tests}
        selected={s.selectedTest}
        onSelect={s.setSelectedTest}
        onRun={s.run}
        running={s.running}
        blockedReason={selected ? s.runBlockedReason(selected) : null}
      />
    </TopBar>
  );
}

/** Where work is waiting after this analysis. */
function Links({ stats }: { stats: HomeStats }) {
  const s = useSession();
  const { setView } = useAppView();
  const planned = s.batch?.plan?.scheduled.length ?? 0;
  return (
    <>
      <BarLink
        title="Action plan"
        count={planned}
        hint={
          planned > 0
            ? `${plural(planned, "thing")} to do, most marks first.`
            : "Nothing to plan from this analysis."
        }
        onClick={() => setView("plan")}
      />
      <BarLink
        tone={s.openCount > 0 ? "flag" : "neutral"}
        count={s.openCount > 0 ? s.openCount : undefined}
        title={s.openCount > 0 ? "Needs your call" : "Nothing needs your call"}
        hint={
          s.openCount > 0
            ? `${BRAND_NAME} was not sure enough to decide alone.`
            : "It decided everything it was sure about."
        }
        onClick={() => setView("review")}
      />
      {stats.whole.length > 0 && (
        <BarLink
          tone="neutral"
          title={`${stats.whole.length === 1 ? "One" : stats.whole.length} whole-class ${stats.whole.length === 1 ? "problem" : "problems"}`}
          hint={`A mistake made by ${pct(s.sharedThreshold)} or more of the class. See who on the Class page.`}
          onClick={() => setView("class")}
        />
      )}
    </>
  );
}

function Details({ stats }: { stats: HomeStats | null }) {
  const s = useSession();
  const test = s.tests.find((t) => t.id === s.selectedTest);
  const batch = s.batch;
  const label = batch ? analysisLabel(s.testName(batch.assessment_id), batch.trace[0]?.timestamp) : "";
  return (
    <div className="space-y-4">
      <div className="space-y-1 text-sm text-ink-muted">
        {test && (
          <p>
            {test.display_name ?? test.name}: {test.question_count} questions,{" "}
            {marksLabel(test.points_possible)}, {test.submission_count} of {test.expected_count}{" "}
            answer sheets in.
          </p>
        )}
        <p>
          {batch
            ? s.preloaded
              ? `${label}. A worked example from a practice class, so you can look around.`
              : `${label}.`
            : "This test has not been analysed yet."}{" "}
          Every mark is a draft. {BRAND_NAME} never sets a final mark on its own.
        </p>
      </div>
      {stats && (
        <Figures
          items={[
            { label: "Students", value: stats.students },
            { label: "Marks lost", value: `${stats.lost} of ${stats.possible}` },
            { label: "Class average", value: `${stats.mean} of ${stats.outOf}` },
            { label: "Whole-class problems", value: stats.whole.length },
            {
              label: "Waiting for you",
              value: s.openCount,
              tone: s.openCount > 0 ? "flag" : "default",
            },
          ]}
        />
      )}
      {batch && (
        <HowWorkedOut
          events={s.trace}
          status={s.status}
          elapsedMs={s.elapsedMs}
          health={s.health}
          running={s.running}
          stage={s.stage}
        />
      )}
    </div>
  );
}
