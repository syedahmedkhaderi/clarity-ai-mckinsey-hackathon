/**
 * Highlights the cited span inline inside the learner's own answer.
 *
 * The backend guarantees the span is a verbatim substring of the answer, and
 * rejects any diagnosis where it is not. If the span is not found here that is a
 * contract violation worth showing rather than hiding, so the raw answer renders
 * unhighlighted and a note is shown.
 */
export function EvidenceSpan({ answer, span }: { answer: string; span: string }) {
  if (!span) {
    return <p className="text-sm text-ink whitespace-pre-wrap">{answer}</p>;
  }
  const at = answer.indexOf(span);
  if (at < 0) {
    return (
      <div>
        <p className="text-sm text-ink whitespace-pre-wrap">{answer}</p>
        <p className="mt-1 text-2xs text-flag">
          The cited evidence was not found verbatim in this answer.
        </p>
      </div>
    );
  }
  return (
    <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">
      {answer.slice(0, at)}
      <mark className="bg-agent-soft text-ink border-b-2 border-agent px-0.5 rounded-sm">
        {span}
      </mark>
      {answer.slice(at + span.length)}
    </p>
  );
}
