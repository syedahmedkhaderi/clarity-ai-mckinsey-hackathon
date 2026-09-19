/**
 * The student's own answer with the words the finding rests on highlighted in
 * place.
 *
 * The backend guarantees the span is a verbatim substring of the answer and
 * rejects any diagnosis where it is not. If it is not found here, that is a
 * contract violation worth showing rather than hiding, so the raw answer renders
 * unhighlighted with a note.
 */
export function EvidenceSpan({ answer, span }: { answer: string; span: string }) {
  // The student's own words: a left rule so it reads as a quotation, apart from the system's text.
  const box =
    "rounded border border-line border-l-[3px] border-l-ink-faint bg-surface px-3 py-2 text-sm text-ink";
  if (!answer.trim()) {
    return <p className={`${box} text-ink-faint`}>No answer was given.</p>;
  }
  const at = span ? answer.indexOf(span) : -1;
  if (at < 0) {
    return (
      <div>
        <p className={`${box} whitespace-pre-wrap leading-relaxed`}>{answer}</p>
        {span && (
          <p className="mt-1 text-2xs text-flag">
            The words we pointed to could not be found in this answer, so none are highlighted.
          </p>
        )}
      </div>
    );
  }
  return (
    <p className={`${box} whitespace-pre-wrap leading-relaxed`}>
      {answer.slice(0, at)}
      <mark
        className="bg-agent-soft text-ink border-b-2 border-agent px-0.5 rounded-sm"
        title="The words this finding is based on"
      >
        {span}
      </mark>
      {answer.slice(at + span.length)}
    </p>
  );
}
