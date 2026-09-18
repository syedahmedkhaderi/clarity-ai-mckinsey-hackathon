import clsx from "clsx";
import { useState, type ReactNode } from "react";
import { useAppView, type ViewKey } from "../hooks/useAppView";
import { useSession } from "../hooks/useSession";
import { BRAND_NAME, ORG_NAME } from "../lib/brand";
import type { Course } from "../types";
import coursesFixture from "../fixtures/lms_courses.json";

const NAV: { label: string; key: ViewKey }[] = [
  { label: "Home", key: "home" },
  { label: "Students", key: "students" },
  { label: "Class", key: "class" },
  { label: "Action plan", key: "plan" },
  { label: "To review", key: "review" },
];

const ACTIVE_COURSE_ID = "C1";

type CourseContext = Course & { analysisAvailable: boolean };

const COURSE_CONTEXTS: CourseContext[] = [
  ...coursesFixture.courses.map((course) => ({ ...course, analysisAvailable: true })),
  {
    id: "demo-literacy",
    name: "Meridian Centre 4 - Foundational Literacy, Wednesday cohort",
    term: "2026 Term 3",
    enrolled: 14,
    analysisAvailable: false,
  },
  {
    id: "demo-science",
    name: "Meridian Centre 4 - Practical Science, Thursday cohort",
    term: "2026 Term 3",
    enrolled: 10,
    analysisAvailable: false,
  },
];

const LMS_DESTINATIONS = ["Calendar", "Messages", "Files and resources", "Grades"];

/**
 * The institutional wrapper. Deliberately plain: this is the portal a teacher
 * already uses every day, and the pages inside it carry the visual weight.
 * Under 768px the sidebar becomes a row of links along the top.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { view, setView } = useAppView();
  const { health, openCount, error, clearError } = useSession();
  const [selectedCourseId, setSelectedCourseId] = useState(ACTIVE_COURSE_ID);
  const offline = (health?.provider ?? "offline") === "offline";
  const selectedCourse =
    COURSE_CONTEXTS.find((course) => course.id === selectedCourseId) ?? COURSE_CONTEXTS[0];
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
        <aside
          aria-label="LMS navigation"
          className={clsx(
            "shrink-0 bg-surface border-line",
            "flex flex-col border-b px-2",
            "md:block md:w-60 md:border-b-0 md:border-r md:px-0",
            "md:min-h-[calc(100vh-3.5rem)]",
          )}
        >
          <section className="w-full border-b border-line px-4 py-4 md:px-4" aria-labelledby="lms-context-title">
            <p id="lms-context-title" className="text-sm font-semibold tracking-tight text-ink">
              Meridian LMS
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">Courses</p>

            <label htmlFor="course-context" className="mt-4 block text-2xs font-medium uppercase tracking-wide text-ink-faint">
              Course context
            </label>
            <select
              id="course-context"
              value={selectedCourse.id}
              onChange={(event) => setSelectedCourseId(event.target.value)}
              className="mt-1.5 w-full min-w-0 rounded border border-line-strong bg-surface px-2.5 py-2 text-sm leading-5 text-ink outline-none transition-colors focus:border-ink focus:ring-1 focus:ring-ink"
            >
              {COURSE_CONTEXTS.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                  {!course.analysisAvailable ? " (not connected)" : ""}
                </option>
              ))}
            </select>

            <p className="mt-2 text-xs font-medium leading-4 text-ink">{selectedCourse.name}</p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-2xs text-ink-muted">
              <span>{selectedCourse.term}</span>
              <span>{selectedCourse.enrolled} enrolled</span>
            </div>
            {!selectedCourse.analysisAvailable && (
              <p className="mt-3 border-l-2 border-flag pl-2 text-2xs leading-4 text-flag">
                This subject is visible in the LMS, but it is not connected to LOOP in this demo.
              </p>
            )}
          </section>

          <div className="w-full px-2 py-4 md:px-3">
            <p className="px-2 pb-2 text-2xs font-medium uppercase tracking-wide text-ink-faint">LOOP analysis</p>
            <nav aria-label="LOOP analysis" className="space-y-0.5">
              {NAV.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setView(item.key)}
                  aria-current={active === item.key ? "page" : undefined}
                  className={clsx(
                    "whitespace-nowrap text-left px-2.5 py-2 text-sm flex items-center gap-2 rounded-sm",
                    "w-full justify-between transition-colors",
                    active === item.key
                      ? "bg-surface-sunken text-ink font-medium border-l-2 border-ink pl-2"
                      : "border-l-2 border-transparent text-ink-muted hover:bg-surface-sunken hover:text-ink",
                  )}
                >
                  {item.label}
                  {item.key === "review" && openCount > 0 && (
                    <span className="tag border-flag-line bg-flag-soft text-flag num">{openCount}</span>
                  )}
                </button>
              ))}
            </nav>

            <div className="mt-6 border-t border-line pt-4" aria-label="Other LMS destinations">
              <p className="px-2 pb-2 text-2xs font-medium uppercase tracking-wide text-ink-faint">Other LMS destinations</p>
              <div className="space-y-0.5">
                {LMS_DESTINATIONS.map((destination) => (
                  <button
                    key={destination}
                    type="button"
                    disabled
                    title="This destination is outside the LOOP demo"
                    className="flex w-full cursor-not-allowed items-center justify-between rounded-sm px-2.5 py-2 text-left text-sm text-ink-faint opacity-80"
                  >
                    <span>{destination}</span>
                    <span className="text-2xs">Not in demo</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

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
          {!selectedCourse.analysisAvailable ? (
            <div className="panel max-w-2xl p-6 md:p-8">
              <p className="text-2xs font-medium uppercase tracking-wide text-flag">Analysis unavailable</p>
              <h1 className="mt-2 text-lg font-semibold tracking-tight text-ink">This course is not connected to LOOP yet.</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-ink-muted">
                Choose Meridian Centre 4 - Foundational Mathematics to return to the assessment analysis workspace.
              </p>
              <button className="btn btn-xs mt-4" onClick={() => setSelectedCourseId(ACTIVE_COURSE_ID)}>
                Return to mathematics
              </button>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
