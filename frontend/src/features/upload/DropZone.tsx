import clsx from "clsx";
import { useRef, useState } from "react";
import { sizeLabel, type PickedFile } from "./files";

/**
 * A place to drop files or choose them. It only hands the raw files up; reading
 * and checking them is the caller's job, so the same zone serves both steps.
 */
export function DropZone({
  id,
  accept,
  multiple = false,
  prompt,
  files,
  problems,
  onPick,
  onRemove,
}: {
  id: string;
  accept: string;
  multiple?: boolean;
  prompt: string;
  files: PickedFile[];
  problems: string[];
  onPick: (files: File[]) => void;
  onRemove: (name: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const pick = (list: FileList | null) => {
    if (list && list.length) onPick(Array.from(list));
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          pick(e.dataTransfer.files);
        }}
        className={clsx(
          "rounded-md border border-dashed px-4 py-6 text-center transition-colors",
          over ? "border-ink-muted bg-surface-sunken" : "border-line-strong bg-surface-raised",
        )}
      >
        <p className="text-sm text-ink">{prompt}</p>
        <button type="button" className="btn mt-2" onClick={() => input.current?.click()}>
          {multiple ? "Choose files" : "Choose a file"}
        </button>
        <input
          ref={input}
          id={id}
          type="file"
          accept={accept}
          multiple={multiple}
          className="sr-only"
          onChange={(e) => {
            pick(e.target.files);
            // Clearing the value lets the same file be chosen again after removing it.
            e.target.value = "";
          }}
        />
      </div>

      {problems.length > 0 && (
        <ul role="alert" className="mt-2 space-y-1 text-sm text-flag">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <div className="mt-3">
          {multiple && (
            <p className="text-xs text-ink-muted mb-1">
              {files.length} {files.length === 1 ? "file" : "files"} added
            </p>
          )}
          <ul className="max-h-48 overflow-auto rounded-md border border-line divide-y divide-line">
            {files.map((f) => (
              <li key={f.name} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate text-ink">{f.name}</span>
                <span className="num text-ink-faint">{sizeLabel(f.size)}</span>
                <button
                  type="button"
                  className="btn btn-xs"
                  onClick={() => onRemove(f.name)}
                  aria-label={`Remove ${f.name}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
