import clsx from "clsx";
import { useState } from "react";
import { useSession } from "../hooks/useSession";
import { LANGUAGE_FINDING_SENTENCE } from "../lib/format";
import type { Diagnosis, Question, TaxonomyNode } from "../types";
import { EvidenceSpan } from "./EvidenceSpan";

/**
 * Where one mark was lost, for reading rather than deciding: the question, the
 * student's answer with the evidence highlighted, and why it is wrong. Folded
 * to its title until opened, so a student with many findings stays one screen.
 * Corrections are made from the Class page and To review, where the teacher
 * sees the rest of the class beside it.
 */
export function FindingCard({
  diagnosis,
  question,
  answer,
  node,
}: {
  diagnosis: Diagnosis;
  question?: Question;
  answer: string;
  node?: TaxonomyNode;
}) {
  const { questionName, plain } = useSession();
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded border border-line-strong bg-surface">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-x-3 bg-surface-head px-3 py-2.5 text-left hover:bg-surface-sunken"
      >
        <span className="shrink-0 text-xs text-ink-faint">{questionName(diagnosis.question_id)}</span>
        <span className="min-w-0 flex-1 text-sm font-medium text-ink">
          {node?.label ?? diagnosis.taxonomy_node}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
          className={clsx("shrink-0 text-ink-muted transition-transform", open ? "-rotate-90" : "rotate-90")}
        >
          <path d="M4.5 2.5 8 6l-3.5 3.5" />
        </svg>
      </button>

      {open && (
        <div className="space-y-3 border-t border-line p-3">
          {question && (
            <div className="rounded bg-surface-inset px-3 py-2">
              <div className="mb-0.5 text-2xs uppercase tracking-wide text-ink-faint">The question</div>
              <p className="text-sm text-ink">{question.prompt}</p>
            </div>
          )}
          <div>
            <div className="mb-1 text-2xs uppercase tracking-wide text-ink-faint">
              Their answer, with the evidence highlighted
            </div>
            <EvidenceSpan answer={answer} span={diagnosis.evidence_span} />
          </div>
          <div>
            <div className="mb-0.5 text-2xs uppercase tracking-wide text-ink-faint">Why it is wrong</div>
            {diagnosis.language_flag && (
              <p className="mb-1 text-sm text-flag">{LANGUAGE_FINDING_SENTENCE}</p>
            )}
            <p className="text-sm text-ink">{plain(diagnosis.reasoning)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
