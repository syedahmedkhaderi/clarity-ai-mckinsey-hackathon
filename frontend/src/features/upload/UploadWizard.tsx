import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError } from "../../api/client";
import { uploadApi } from "../../api/upload";
import { useSession } from "../../hooks/useSession";
import type { SavedTest, UploadIssue, UploadRequest } from "../../types/upload";
import { CheckStep } from "./CheckStep";
import {
  DEFAULT_CLASS_NAME,
  PAPER_ACCEPT_PHRASE,
  PAPER_EXTENSIONS,
  SHEET_ACCEPT_PHRASE,
  SHEET_EXTENSIONS,
  STEPS,
} from "./copy";
import { mergeFiles, readPicked, toFileIn, type PickedFile } from "./files";
import { Stepper } from "./Stepper";
import { StepPaper, StepSave, StepSheets } from "./Steps";
import { useAfterSave } from "./useAfterSave";
import { useUploadedClasses } from "./useUploadedClasses";

const GENERIC_FAILURE = "Something went wrong. Please try again.";

function failureText(e: unknown): string {
  return e instanceof ApiError ? e.message : GENERIC_FAILURE;
}

function issuesOf(e: unknown): UploadIssue[] {
  if (!(e instanceof ApiError)) return [];
  return e.errors.map((i) => ({ file: i.file ?? "", where: i.where ?? "", message: i.message }));
}

/** The four steps. It owns the chosen files, so leaving the page starts afresh. */
export function UploadWizard({ onSaved }: { onSaved: (saved: SavedTest) => void }) {
  const { health } = useSession();
  const afterSave = useAfterSave();

  const [step, setStep] = useState(1);
  const [paper, setPaper] = useState<PickedFile | null>(null);
  const [paperProblems, setPaperProblems] = useState<string[]>([]);
  const [sheets, setSheets] = useState<PickedFile[]>([]);
  const [sheetProblems, setSheetProblems] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [classId, setClassId] = useState("");
  const [className, setClassName] = useState(DEFAULT_CLASS_NAME);

  const classes = useUploadedClasses();

  const preview = useMutation({ mutationFn: uploadApi.preview });
  const save = useMutation({
    mutationFn: uploadApi.saveTest,
    onSuccess: (saved) => {
      afterSave(saved);
      onSaved(saved);
    },
  });

  const request = (): UploadRequest | null => {
    if (!paper) return null;
    const name = className.trim() || DEFAULT_CLASS_NAME;
    return {
      ...(classId ? { class_id: classId } : { class_name: name }),
      ...(title.trim() ? { title: title.trim() } : {}),
      paper: toFileIn(paper),
      sheets: sheets.map(toFileIn),
    };
  };

  const pickPaper = async (picked: File[]) => {
    const result = await readPicked(picked.slice(0, 1), PAPER_EXTENSIONS, PAPER_ACCEPT_PHRASE);
    const problems = [...result.problems];
    if (picked.length > 1) problems.push("Only one test file is needed. The first one was used.");
    setPaperProblems(problems);
    if (result.files[0]) setPaper(result.files[0]);
  };

  const pickSheets = async (picked: File[]) => {
    const result = await readPicked(picked, SHEET_EXTENSIONS, SHEET_ACCEPT_PHRASE);
    setSheetProblems(result.problems);
    setSheets((current) => mergeFiles(current, result.files));
  };

  const runCheck = () => {
    const body = request();
    if (body) preview.mutate(body);
  };

  const next = () => {
    setStep(step + 1);
    if (step === 2) runCheck();
  };

  const canNext =
    (step === 1 && paper !== null && (classId !== "" || className.trim() !== "")) ||
    (step === 2 && sheets.length > 0) ||
    (step === 3 && preview.data?.ok === true && !preview.isPending);

  const chosenClass = classId
    ? (classes.data?.find((c) => c.id === classId)?.name ?? classId)
    : className.trim() || DEFAULT_CLASS_NAME;

  return (
    <section className="panel">
      <div className="panel-head">
        <Stepper steps={STEPS} current={step} onGo={setStep} />
      </div>

      <div className="p-4">
        {step === 1 && (
          <StepPaper
            paper={paper}
            problems={paperProblems}
            onPick={pickPaper}
            onRemove={() => setPaper(null)}
            details={{
              title,
              onTitle: setTitle,
              classId,
              onClassId: setClassId,
              className,
              onClassName: setClassName,
              classes: classes.data ?? [],
            }}
          />
        )}
        {step === 2 && (
          <StepSheets
            sheets={sheets}
            problems={sheetProblems}
            onPick={pickSheets}
            onRemove={(name) => setSheets((cur) => cur.filter((f) => f.name !== name))}
          />
        )}
        {step === 3 && (
          <CheckStep
            preview={preview.data}
            pending={preview.isPending}
            failure={preview.isError ? failureText(preview.error) : null}
            onRetry={runCheck}
          />
        )}
        {step === 4 && preview.data && (
          <StepSave
            title={preview.data.summary.title}
            className={chosenClass}
            questions={preview.data.summary.question_count}
            students={preview.data.summary.student_count}
            aiAvailable={health?.ai_available !== false}
            saveError={save.isError ? failureText(save.error) : null}
            saveIssues={save.isError ? issuesOf(save.error) : []}
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-raised px-4 py-3">
        {step > 1 ? (
          <button type="button" className="btn" onClick={() => setStep(step - 1)}>
            Back
          </button>
        ) : (
          <span />
        )}
        {step < 4 ? (
          <button type="button" className="btn btn-primary" disabled={!canNext} onClick={next}>
            Next
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={save.isPending}
            onClick={() => {
              const body = request();
              if (body) save.mutate(body);
            }}
          >
            {save.isPending ? "Saving" : "Save this test"}
          </button>
        )}
      </div>
    </section>
  );
}
