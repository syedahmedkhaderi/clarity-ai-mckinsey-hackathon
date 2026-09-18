import { useState } from "react";
import { Panel } from "../../components/ui/Panel";
import { useSession } from "../../hooks/useSession";
import { whenLabel } from "./copy";
import { ReviewDialog } from "./ReviewDialog";
import { EmailAddress, StateTag } from "./parts";
import { useSentEmails, useStudents } from "./queries";

/** On a student's page: their address, a note to write, and what was already sent. */
export function StudentEmail({ learnerId }: { learnerId: string }) {
  const { batch } = useSession();
  const [writing, setWriting] = useState(false);
  const students = useStudents();
  const sent = useSentEmails();

  const email = (students.data ?? []).find((s) => s.learner_id === learnerId)?.email ?? "";
  const hasFinding = !!batch?.diagnoses.some((d) => d.learner_id === learnerId && d.taxonomy_node);
  const history = (sent.data ?? [])
    .filter((e) => e.kind === "student" && e.learner_id === learnerId)
    .sort((a, b) => b.email_id - a.email_id);

  return (
    <Panel title="Email for this student">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <EmailAddress key={email} learnerId={learnerId} email={email} />
        {hasFinding ? (
          <button className="btn btn-xs" onClick={() => setWriting(true)}>
            Write a note
          </button>
        ) : (
          <span className="text-xs text-ink-faint">There is no mistake pattern to write about.</span>
        )}
      </div>

      {history.length > 0 && (
        <ul className="mt-3 border-t border-line pt-3 space-y-2">
          {history.map((e) => (
            <li key={e.email_id} className="flex items-center gap-3 text-sm">
              <span className="text-xs text-ink-muted whitespace-nowrap">{whenLabel(e.created_at)}</span>
              <span className="min-w-0 truncate text-ink">{e.subject}</span>
              <span className="ml-auto">
                <StateTag state={e.status} />
              </span>
            </li>
          ))}
        </ul>
      )}

      {writing && <ReviewDialog learnerId={learnerId} onClose={() => setWriting(false)} />}
    </Panel>
  );
}
