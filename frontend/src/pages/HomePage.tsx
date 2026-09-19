import { HowWorkedOut } from "../components/HowWorkedOut";
import { RunProgress } from "../components/RunProgress";
import { TestPicker } from "../components/TestPicker";
import { EmptyState } from "../components/ui/EmptyState";
import { useAppView } from "../hooks/useAppView";
import { useSession } from "../hooks/useSession";
import { analysisLabel, pct } from "../lib/format";
import { BarLink, Figures, PageHeader, TopBar, TopSurface } from "../shell/WorkSurface";
import { plural } from "./classStats";
import { OverviewTab, homeStats, type HomeStats } from "./HomeSummary";
import { BRAND_NAME } from "../lib/brand";

/**
 * Home is the overview of one test. The bar across the top chooses the test and
 * points to where work is waiting; the numbers behind the pictures stay folded
 * away until asked for, so the charts get the screen.
 */
export function HomePage() {
  const s = useSession();
  const stats = s.batch ? homeStats(s.batch, s.topicName) : null;

  return (
    <TopSurface header={<Header />} bar={<Bar stats={stats} />}>
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
        <OverviewTab stats={stats} />
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

function Header() {
  const s = useSession();
  const { setView } = useAppView();
  const batch = s.batch;
  const label = batch ? analysisLabel(s.testName(batch.assessment_id), batch.trace[0]?.timestamp) : "";
  return (
    <PageHeader
      title={batch ? s.testName(batch.assessment_id) : "Home"}
      subtitle={
        !batch
          ? `Every mark ${BRAND_NAME} gives is a draft. It never sets a final mark on its own.`
          : s.preloaded
            ? `${label}. A worked example from a practice class, so you can look around. Every mark is a draft.`
            : `${label}. Every mark is a draft.`
      }
      action={
        <button className="btn btn-xs" onClick={() => setView("upload")}>
          Add a test
        </button>
      }
    />
  );
}

/** The test, the places work is waiting, and the test's numbers behind a toggle. */
function Bar({ stats }: { stats: HomeStats | null }) {
  const s = useSession();
  const selected = s.tests.find((t) => t.id === s.selectedTest);
  return (
    <TopBar
      details={stats ? <Details stats={stats} /> : undefined}
      detailsLabel="test details"
      end={stats ? <Links stats={stats} /> : undefined}
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

function Details({ stats }: { stats: HomeStats }) {
  const s = useSession();
  return (
    <div className="space-y-4">
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
