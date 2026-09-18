import clsx from "clsx";
import { Fragment } from "react";

export interface StepInfo {
  id: number;
  label: string;
}

/** Numbered progress. Earlier steps can be revisited; later ones are reached with Next. */
export function Stepper({
  steps,
  current,
  onGo,
}: {
  steps: readonly StepInfo[];
  current: number;
  onGo: (id: number) => void;
}) {
  return (
    <ol className="flex items-center gap-2" aria-label="Steps">
      {steps.map((s, i) => {
        const done = s.id < current;
        const active = s.id === current;
        const circle = (
          <span
            className={clsx(
              "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border num",
              active && "border-ink bg-ink text-white",
              done && "border-ink bg-surface text-ink",
              !active && !done && "border-line-strong bg-surface text-ink-faint",
            )}
          >
            {s.id}
          </span>
        );
        const label = (
          <span
            className={clsx(
              "text-sm whitespace-nowrap",
              active ? "font-medium text-ink" : "text-ink-muted",
              !active && "hidden sm:inline",
            )}
          >
            {s.label}
          </span>
        );
        return (
          <Fragment key={s.id}>
            <li aria-current={active ? "step" : undefined} className="flex items-center gap-2">
              {done ? (
                <button
                  type="button"
                  onClick={() => onGo(s.id)}
                  className="flex items-center gap-2 hover:opacity-70"
                >
                  {circle}
                  {label}
                </button>
              ) : (
                <>
                  {circle}
                  {label}
                </>
              )}
            </li>
            {i < steps.length - 1 && (
              <li aria-hidden className="h-px min-w-4 flex-1 bg-line-strong" />
            )}
          </Fragment>
        );
      })}
    </ol>
  );
}
