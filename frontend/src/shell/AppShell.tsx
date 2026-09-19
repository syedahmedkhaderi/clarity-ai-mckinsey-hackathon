import clsx from "clsx";
import { useState, type ReactNode } from "react";
import { Select } from "../components/ui/Select";
import { useAppView, type ViewKey } from "../hooks/useAppView";
import { useSession } from "../hooks/useSession";
import { BRAND_NAME, ORG_NAME } from "../lib/brand";
import type { Course } from "../types";
import coursesFixture from "../fixtures/lms_courses.json";

const NAV: { label: string; key: ViewKey }[] = [
  { label: "Home", key: "home" },
  { label: "Students", key: "students" },
  { label: "Action plan", key: "plan" },
  { label: "To review", key: "review" },
];

const ACTIVE_COURSE_ID = "C1";

type CourseContext = Course & { analysisAvailable: boolean; subject: string };

const COURSE_CONTEXTS: CourseContext[] = [
  ...coursesFixture.courses.map((course) => ({
    ...course,
    // The portal names a course by centre and subject; the cohort day is noise here.
    name: course.name.replace(/,\s*\w+ cohort$/, ""),
    analysisAvailable: true,
    subject: "Mathematics",
  })),
  {
    id: "demo-literacy",
    name: "Meridian Centre 4 - Foundational Literacy",
    term: "2026 Term 3",
    enrolled: 14,
    analysisAvailable: false,
    subject: "Literacy",
  },
  {
    id: "demo-science",
    name: "Meridian Centre 4 - Practical Science",
    term: "2026 Term 3",
    enrolled: 10,
    analysisAvailable: false,
    subject: "Science",
  },
];

/** The parts of a course page the portal already has. None of them are part of the demo. */
const COURSE_SECTIONS = ["Overview", "Materials", "Assignments", "Grades", "Announcements"];

/**
 * The institutional wrapper. Deliberately plain: this is the portal a teacher
 * already uses every day, and the pages inside it carry the visual weight.
 * The sidebar reads top to bottom as the portal does: the course first, its
 * ordinary sections next, and LOOP's pages last.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { view, setView } = useAppView();
  const { openCount, error, clearError } = useSession();
  const [selectedCourseId, setSelectedCourseId] = useState(ACTIVE_COURSE_ID);
  const selectedCourse =
    COURSE_CONTEXTS.find((course) => course.id === selectedCourseId) ?? COURSE_CONTEXTS[0];
  // Adding a test starts from Home, so Home stays lit while the upload page is open.
  const active: ViewKey = view === "upload" ? "home" : view;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-bar px-4 text-white md:static md:px-5">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <span className="text-sm font-semibold tracking-wide">{BRAND_NAME}</span>
          <span className="truncate text-xs text-white/50">{ORG_NAME}</span>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/70">Teacher</span>
            <div
              className="grid h-7 w-7 place-items-center rounded-full bg-white/15 text-2xs font-medium"
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
            "shrink-0 border-shell-line bg-shell",
            "flex flex-col border-b",
            "md:block md:w-60 md:border-b-0 md:border-r",
            // Stays put while the page scrolls; its own content scrolls if it is taller than the window.
            "md:sticky md:top-0 md:max-h-screen md:self-start md:overflow-y-auto md:min-h-screen",
          )}
        >
          <section className="border-b border-shell-line px-4 py-4" aria-labelledby="lms-context-title">
            <p id="lms-context-title" className="text-sm font-semibold tracking-tight text-ink">
              Meridian LMS
            </p>

            <Select
              id="course-context"
              label="Course"
              value={selectedCourse.id}
              onChange={setSelectedCourseId}
              className="mt-3"
              groups={[
                {
                  options: COURSE_CONTEXTS.map((course) => ({
                    value: course.id,
                    label: course.subject,
                    sub: course.name,
                    meta: course.analysisAvailable ? `${course.enrolled} enrolled` : "Not connected",
                    metaTone: course.analysisAvailable ? "default" : "flag",
                  })),
                },
              ]}
            />

            <p className="mt-2 text-xs leading-4 text-ink-muted">{selectedCourse.name}</p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-2xs text-ink-faint">
              <span>{selectedCourse.term}</span>
              <span>{selectedCourse.enrolled} enrolled</span>
            </div>
          </section>

          <div className="hidden border-b border-shell-line px-3 py-3 md:block" aria-label="Course sections">
            <p className="px-2 pb-1.5 text-2xs font-medium uppercase tracking-wide text-ink-faint">
              Course pages
            </p>
            <div className="space-y-0.5">
              {COURSE_SECTIONS.map((section) => (
                <button
                  key={section}
                  type="button"
                  disabled
                  title={`This part of the course is outside the ${BRAND_NAME} demo`}
                  className="flex w-full cursor-not-allowed items-center rounded-sm border-l-2 border-transparent px-2.5 py-1.5 text-left text-sm text-ink-faint"
                >
                  {section}
                </button>
              ))}
            </div>
          </div>

          <div className="px-2 py-3 md:px-3 md:py-4">
            <p className="px-2 pb-1.5 text-2xs font-medium uppercase tracking-wide text-agent">
              {BRAND_NAME}
            </p>
            <nav aria-label={BRAND_NAME} className="grid grid-cols-2 gap-1 md:block md:space-y-0.5">
              {NAV.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setView(item.key)}
                  aria-current={active === item.key ? "page" : undefined}
                  className={clsx(
                    "flex items-center gap-2 whitespace-nowrap rounded-sm px-2 py-1.5 text-left text-xs md:px-2.5 md:py-2 md:text-sm",
                    "w-full justify-between transition-colors",
                    active === item.key
                      ? "border-l-2 border-agent bg-surface pl-1.5 font-medium text-ink md:pl-2"
                      : "border-l-2 border-transparent text-ink-muted hover:bg-surface hover:text-ink",
                  )}
                >
                  {item.label}
                  {item.key === "review" && openCount > 0 && (
                    <span className="count-flag">{openCount}</span>
                  )}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-24 md:pb-0">
          {error && (
            <div
              role="alert"
              className="flex items-start gap-3 border-b border-flag-line bg-flag-soft px-4 py-3 md:px-6"
            >
              <p className="flex-1 text-sm text-flag">{error}</p>
              <button className="btn btn-xs shrink-0" onClick={clearError}>
                Dismiss
              </button>
            </div>
          )}
          {!selectedCourse.analysisAvailable ? (
            <div className="p-4 md:p-6">
              <div className="panel max-w-2xl p-6 md:p-8">
                <p className="text-2xs font-medium uppercase tracking-wide text-ink-faint">Analysis unavailable</p>
                <h1 className="mt-2 text-lg font-semibold tracking-tight text-ink">
                  This course is not connected to {BRAND_NAME} yet.
                </h1>
                <p className="mt-2 max-w-xl text-sm leading-6 text-ink-muted">
                  Choose Mathematics to return to the assessment analysis.
                </p>
                <button className="btn btn-xs mt-4" onClick={() => setSelectedCourseId(ACTIVE_COURSE_ID)}>
                  Return to mathematics
                </button>
              </div>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
