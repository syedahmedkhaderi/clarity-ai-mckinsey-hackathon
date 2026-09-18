import type { Diagnosis, Question, TaxonomyNode } from "../types";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { EvidenceSpan } from "./EvidenceSpan";
import { DIAGNOSIS_SOURCE_LABELS, ERROR_CLASS_LABELS, REASON_LABELS } from "../lib/format";
import { useSession } from "../hooks/useSession";

/**
 * One mistake pattern, shown with the student's own answer and the words the
 * system pointed to inside it. The reasoning is the system's, verbatim.
 */
export function DiagnosisDetail({
  diagnosis,
  question,
  answer,
  node,
  alternative,
  awarded,
  onOverride,
}: {
  diagnosis: Diagnosis;
  question?: Question;
  answer: string;
  node?: TaxonomyNode;
  alternative?: TaxonomyNode;
  awarded?: string;
  onOverride?: () => void;
}) {
  const { questionName } = useSession();
  return (
    <div className="border border-line rounded-md overflow-hidden">
      <div className="px-3 py-2 bg-surface-raised border-b border-line flex flex-wrap items-center gap-2">
        <span className="text-xs text-ink-faint">{questionName(diagnosis.question_id)}</span>
        <span className="text-sm font-medium text-ink">{node?.label ?? diagnosis.taxonomy_node}</span>
        <span className="tag border-line bg-surface-sunken text-ink-muted">
          {ERROR_CLASS_LABELS[diagnosis.error_class] ?? diagnosis.error_class}
        </span>
        {diagnosis.language_flag && (
          <span className="tag border-flag-line bg-flag-soft text-flag">{REASON_LABELS.LANGUAGE_BARRIER}</span>
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
        {question && (
          <div>
            <div className="text-2xs uppercase tracking-wide text-ink-faint mb-0.5">Question</div>
            <p className="text-sm text-ink-muted">{question.prompt}</p>
          </div>
        )}
        <div>
          <div className="text-2xs uppercase tracking-wide text-ink-faint mb-0.5">
            Student's answer, with the evidence highlighted
          </div>
          <EvidenceSpan answer={answer} span={diagnosis.evidence_span} />
        </div>
        <div>
          <div className="text-2xs uppercase tracking-wide text-ink-faint mb-0.5">
            Why marks were lost
          </div>
          <p className="text-sm text-ink-muted">{diagnosis.reasoning}</p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-faint pt-1 border-t border-line">
          <span>How this was found: {DIAGNOSIS_SOURCE_LABELS[diagnosis.source] ?? diagnosis.source}</span>
          {alternative && <span>Other possibility: {alternative.label}</span>}
          {node && <span>Next step: {node.remediation_hint}</span>}
        </div>
      </div>
    </div>
  );
}
