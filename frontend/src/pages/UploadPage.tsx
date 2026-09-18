import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError } from "../api/client";
import { uploadApi } from "../api/upload";
import { DonePanel, TopicsPanel, UploadWizard, YourTests, useAfterSave } from "../features/upload";
import type { SavedTest } from "../types/upload";

export function UploadPage() {
  const afterSave = useAfterSave();
  const [saved, setSaved] = useState<SavedTest | null>(null);

  const sample = useMutation({
    mutationFn: uploadApi.sample,
    onSuccess: (result) => {
      afterSave(result);
      setSaved(result);
    },
  });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1 basis-64">
          <h1 className="text-lg font-semibold text-ink">Add a test</h1>
          <p className="text-sm text-ink-muted mt-0.5">
            Add your own test and your students' answers in four short steps. Nothing is marked or
            sent to anyone until you say so.
          </p>
        </div>
        {!saved && (
          <button
            type="button"
            className="btn ml-auto shrink-0"
            disabled={sample.isPending}
            onClick={() => sample.mutate()}
          >
            {sample.isPending ? "Adding the sample" : "Try the sample test"}
          </button>
        )}
      </header>

      {sample.isError && (
        <p role="alert" className="text-sm text-flag">
          {sample.error instanceof ApiError
            ? sample.error.message
            : "The sample test could not be added. Please try again."}
        </p>
      )}

      {saved ? (
        <DonePanel
          saved={saved}
          onAnother={() => {
            sample.reset();
            setSaved(null);
          }}
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
          <UploadWizard onSaved={setSaved} />
          <TopicsPanel />
        </div>
      )}

      <YourTests />
    </div>
  );
}
