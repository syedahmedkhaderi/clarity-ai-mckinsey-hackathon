import { StatTile } from "../../components/ui/StatTile";
import { Tag } from "../../components/ui/Tag";
import type { UploadIssue, UploadPreview, UploadSummary } from "../../types/upload";

function groupByFile(issues: UploadIssue[]): [string, UploadIssue[]][] {
  const groups = new Map<string, UploadIssue[]>();
  for (const issue of issues) {
    const key = issue.file || "Your files";
    groups.set(key, [...(groups.get(key) ?? []), issue]);
  }
  return [...groups.entries()];
}

/** Problems in flag colour, warnings neutral, both grouped by the file they came from. */
export function IssueList({
  issues,
  tone,
  title,
}: {
  issues: UploadIssue[];
  tone: "error" | "warning";
  title: string;
}) {
  if (issues.length === 0) return null;
  const isError = tone === "error";
  return (
    <section
      className={
        isError
          ? "rounded-md border border-flag-line bg-flag-soft"
          : "rounded-md border border-line bg-surface"
      }
    >
      <h3 className={`px-3 py-2 text-sm font-medium ${isError ? "text-flag" : "text-ink"}`}>
        {title}
      </h3>
      <div className="divide-y divide-line border-t border-inherit">
        {groupByFile(issues).map(([file, rows]) => (
          <div key={file} className="px-3 py-2">
            <p className="text-xs font-medium text-ink-muted mb-1">{file}</p>
            <ul className="space-y-1">
              {rows.map((r, i) => (
                <li key={`${r.where}-${i}`} className="flex items-baseline gap-2 text-sm text-ink">
                  {r.where && (
                    <Tag tone={isError ? "flag" : "neutral"} className="shrink-0">
                      {r.where}
                    </Tag>
                  )}
                  <span>{r.message}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function TopicBars({ summary }: { summary: UploadSummary }) {
  const total = Math.max(1, summary.question_count);
  const rows = [
    ...summary.topics.map((t) => ({ key: t.id, label: t.label, count: t.count })),
    ...(summary.untagged_questions > 0
      ? [{ key: "none", label: "No topic", count: summary.untagged_questions }]
      : []),
  ];
  if (rows.length === 0) return null;
  return (
    <div className="rounded-md border border-line bg-surface px-4 py-3">
      <p className="text-xs text-ink-muted mb-2">Questions by topic</p>
      <ul className="space-y-1.5">
        {rows.map((r, i) => (
          <li key={r.key} className="flex items-center gap-3 text-sm">
            <span className="w-40 truncate text-ink">{r.label}</span>
            <span className="h-2 flex-1 rounded-sm bg-surface-sunken">
              <span
                className="anim-grow-x block h-2 rounded-sm bg-chart-light"
                style={{ width: `${Math.round((r.count / total) * 100)}%`, animationDelay: `${i * 60}ms` }}
              />
            </span>
            <span className="num w-8 text-right text-ink-muted">{r.count}</span>
          </li>
        ))}
      </ul>
      {summary.untagged_questions > 0 && (
        <p className="mt-2 text-xs text-ink-muted">
          Questions with no topic are still marked, but no mistake pattern is looked for.
        </p>
      )}
    </div>
  );
}

export function Summary({ summary }: { summary: UploadSummary }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Questions" value={summary.question_count} />
        <StatTile label="Total marks" value={summary.total_marks} />
        <StatTile
          label="Students"
          value={summary.student_count}
          hint={summary.new_students > 0 ? `${summary.new_students} new to the class` : undefined}
        />
        <StatTile
          label="Blank answers"
          value={summary.blank_answers}
          hint={summary.blank_answers > 0 ? "Marked as no answer" : undefined}
        />
      </div>
      <TopicBars summary={summary} />
    </div>
  );
}

/** Step three: what was found in the files, and what to fix before saving. */
export function CheckStep({
  preview,
  pending,
  failure,
  onRetry,
}: {
  preview: UploadPreview | undefined;
  pending: boolean;
  failure: string | null;
  onRetry: () => void;
}) {
  if (pending) {
    return <p className="text-sm text-ink-muted">Checking your files.</p>;
  }
  if (failure) {
    return (
      <div role="alert" className="rounded-md border border-flag-line bg-flag-soft px-3 py-3">
        <p className="text-sm text-flag">{failure}</p>
        <button type="button" className="btn btn-xs mt-2" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }
  if (!preview) return null;

  const hasWarnings = preview.warnings.length > 0;
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink">
        {preview.ok
          ? hasWarnings
            ? `${preview.summary.title || "This test"} can be saved. Have a look at the notes first.`
            : `${preview.summary.title || "This test"} looks good and can be saved.`
          : "Some things need fixing before this test can be saved. Go back, change your files and check again."}
      </p>
      <Summary summary={preview.summary} />
      <IssueList
        issues={preview.errors}
        tone="error"
        title={`${preview.errors.length} ${preview.errors.length === 1 ? "problem" : "problems"} to fix`}
      />
      <IssueList
        issues={preview.warnings}
        tone="warning"
        title={`${preview.warnings.length} ${preview.warnings.length === 1 ? "note" : "notes"}`}
      />
    </div>
  );
}
