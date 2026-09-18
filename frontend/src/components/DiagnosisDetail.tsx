import type { Diagnosis, Question, TaxonomyNode } from "../types";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { EvidenceSpan } from "./EvidenceSpan";
import {
  DIAGNOSIS_SOURCE_LABELS,
  ERROR_CLASS_LABELS,
  LANGUAGE_FINDING_SENTENCE,
  REASON_LABELS,
  STUDENT_TAG_LABELS,
} from "../lib/format";
import { useSession } from "../hooks/useSession";

/**
 * One finding, shown with the student's own answer and the words the system
 * pointed to inside it. The reasoning is the system's, verbatim.
 */
export function DiagnosisDetail({
  diagnosis,
  question,
  answer,
  node,
  alternative,
  awarded,
  needsCall,
  onOverride,
}: {
  diagnosis: Diagnosis;
  question?: Question;
  answer: string;
  node?: TaxonomyNode;
  alternative?: TaxonomyNode;
  /** "1 of 2", shown next to the confidence. */
  awarded?: string;
  /** True when the system handed this finding to the teacher. */
  needsCall?: boolean;
  onOverride?: () => void;
}) {
  const { questionName, plain } = useSession();
  return (
    <div className="border border-line rounded-md overflow-hidden">
      <div className="px-3 py-2 bg-surface-raised border-b border-line flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="text-xs text-ink-faint">{questionName(diagnosis.question_id)}</span>
        <span className="text-sm font-medium text-ink">{node?.label ?? diagnosis.taxonomy_node}</span>
        <span className="tag border-line bg-surface-sunken text-ink-muted">
          {ERROR_CLASS_LABELS[diagnosis.error_class] ?? diagnosis.error_class}
        </span>
        {diagnosis.language_flag && (
          <span className="tag border-flag-line bg-flag-soft text-flag">{REASON_LABELS.LANGUAGE_BARRIER}</span>
        )}
        {needsCall && (
          <span className="tag border-flag-line bg-flag-soft text-flag">{STUDENT_TAG_LABELS.needsCall}</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {awarded && <span className="num text-ink-muted">{awarded}</span>}
          <ConfidenceBadge value={diagnosis.confidence} />
          {onOverride && (
            <button className="btn btn-xs" onClick={onOverride}>
              Correct this
            </button>
          )}
        </div>
      </div>

      <div className="p-3 space-y-3">
        {diagnosis.language_flag && (
          <p className="text-sm text-flag rounded border border-flag-line bg-flag-soft px-3 py-2">
            {LANGUAGE_FINDING_SENTENCE}
          </p>
        )}
        {question && (
          <div>
            <div className="text-2xs uppercase tracking-wide text-ink-faint mb-0.5">The question</div>
            <p className="text-sm text-ink-muted">{question.prompt}</p>
          </div>
        )}
        <div>
          <div className="text-2xs uppercase tracking-wide text-ink-faint mb-1">
            Their answer, with the evidence highlighted
          </div>
          <EvidenceSpan answer={answer} span={diagnosis.evidence_span} />
        </div>
        <div>
          <div className="text-2xs uppercase tracking-wide text-ink-faint mb-0.5">
            Why marks were lost
          </div>
          <p className="text-sm text-ink-muted">{plain(diagnosis.reasoning)}</p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-faint pt-2 border-t border-line">
          {node && <span>Next step: {plain(node.remediation_hint)}</span>}
          {alternative && <span>Other possibility: {alternative.label}</span>}
          <span>Found by: {DIAGNOSIS_SOURCE_LABELS[diagnosis.source] ?? diagnosis.source}</span>
        </div>
      </div>
    </div>
  );
}
