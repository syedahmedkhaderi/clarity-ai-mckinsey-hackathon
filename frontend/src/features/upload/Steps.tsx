import type { ReactNode } from "react";
import type { Course } from "../../types";
import { uploadApi } from "../../api/upload";
import type { TemplateName, UploadIssue } from "../../types/upload";
import { IssueList } from "./CheckStep";
import { DropZone } from "./DropZone";
import { AI_KEY_NOTICE, PAPER_EXTENSIONS, SHEET_EXTENSIONS } from "./copy";
import type { PickedFile } from "./files";

const FIELD =
  "w-full rounded border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-ink focus:outline-none";

export function StepHeading({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <p className="mt-0.5 text-sm text-ink-muted">{children}</p>
    </div>
  );
}

function TemplateLink({ name, children }: { name: TemplateName; children: ReactNode }) {
  return (
    <a
      href={uploadApi.templateUrl(name)}
      download
      className="text-sm text-ink underline underline-offset-2 hover:text-ink-muted"
    >
      {children}
    </a>
  );
}

export interface DetailsProps {
  title: string;
  onTitle: (v: string) => void;
  classId: string;
  onClassId: (v: string) => void;
  className: string;
  onClassName: (v: string) => void;
  classes: Course[];
}

function Details(p: DetailsProps) {
  return (
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor="up-title" className="block text-xs text-ink-muted mb-1">
          Test title (optional)
        </label>
        <input
          id="up-title"
          className={FIELD}
          value={p.title}
          maxLength={120}
          placeholder="For example, Fractions check"
          onChange={(e) => p.onTitle(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="up-class" className="block text-xs text-ink-muted mb-1">
          Which class is this for?
        </label>
        <select
          id="up-class"
          className={FIELD}
          value={p.classId}
          onChange={(e) => p.onClassId(e.target.value)}
        >
          <option value="">A new class</option>
          {p.classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.enrolled} students)
            </option>
          ))}
        </select>
      </div>
      {p.classId === "" && (
        <div>
          <label htmlFor="up-class-name" className="block text-xs text-ink-muted mb-1">
            Class name
          </label>
          <input
            id="up-class-name"
            className={FIELD}
            value={p.className}
            maxLength={80}
            onChange={(e) => p.onClassName(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}

export function StepPaper({
  paper,
  problems,
  onPick,
  onRemove,
  details,
}: {
  paper: PickedFile | null;
  problems: string[];
  onPick: (files: File[]) => void;
  onRemove: () => void;
  details: DetailsProps;
}) {
  return (
    <>
      <StepHeading title="Add the test and marking guide">
        Add one file that lists each question, the marks it is worth and the right answer.
      </StepHeading>
      <DropZone
        id="up-paper"
        accept={PAPER_EXTENSIONS.join(",")}
        prompt="Drag your test file here. CSV and JSON files work."
        files={paper ? [paper] : []}
        problems={problems}
        onPick={onPick}
        onRemove={onRemove}
      />
      <p className="mt-2 flex flex-wrap gap-x-3 text-sm text-ink-muted">
        <TemplateLink name="paper.csv">Download the template</TemplateLink>
        <span>
          or the <TemplateLink name="paper.json">JSON version</TemplateLink>
        </span>
      </p>
      <Details {...details} />
    </>
  );
}

export function StepSheets({
  sheets,
  problems,
  onPick,
  onRemove,
}: {
  sheets: PickedFile[];
  problems: string[];
  onPick: (files: File[]) => void;
  onRemove: (name: string) => void;
}) {
  return (
    <>
      <StepHeading title="Add the students' answers">
        Add one CSV with a row for each student, or one text file for each student.
      </StepHeading>
      <DropZone
        id="up-sheets"
        accept={SHEET_EXTENSIONS.join(",")}
        multiple
        prompt="Drag the answer files here. CSV, TXT and MD files work."
        files={sheets}
        problems={problems}
        onPick={onPick}
        onRemove={onRemove}
      />
      <p className="mt-2 flex flex-wrap gap-x-3 text-sm text-ink-muted">
        <TemplateLink name="sheets.csv">Download the CSV template</TemplateLink>
        <TemplateLink name="sheet.txt">Download a one-student text template</TemplateLink>
      </p>
    </>
  );
}

export function StepSave({
  title,
  className,
  questions,
  students,
  aiAvailable,
  saveError,
  saveIssues,
}: {
  title: string;
  className: string;
  questions: number;
  students: number;
  aiAvailable: boolean;
  saveError: string | null;
  saveIssues: UploadIssue[];
}) {
  const rows: [string, string][] = [
    ["Test", title],
    ["Class", className],
    ["Questions", `${questions}`],
    ["Students", `${students}`],
  ];
  return (
    <>
      <StepHeading title="Save your test">
        Saving adds the test and its answers to your account. Nothing is marked until you start an
        analysis from Home.
      </StepHeading>
      <dl className="rounded-md border border-line divide-y divide-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-4 px-3 py-2 text-sm">
            <dt className="w-24 shrink-0 text-ink-muted">{k}</dt>
            <dd className="min-w-0 text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      {!aiAvailable && (
        <p className="mt-3 rounded-md border border-line bg-surface-sunken px-3 py-2 text-sm text-ink-muted">
          {AI_KEY_NOTICE}
        </p>
      )}
      {saveError && (
        <div role="alert" className="mt-3 space-y-2">
          <p className="text-sm text-flag">{saveError}</p>
          <IssueList issues={saveIssues} tone="error" title="What went wrong" />
        </div>
      )}
    </>
  );
}
