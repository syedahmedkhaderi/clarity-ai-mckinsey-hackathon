import { useMemo, useState } from "react";
import { EmptyState } from "../../components/ui/EmptyState";
import { Panel } from "../../components/ui/Panel";
import { useSession } from "../../hooks/useSession";
import { ReviewDialog } from "./ReviewDialog";
import { SentList } from "./SentList";
import { EmailAddress, StateTag } from "./parts";
import { latestState, useEmailStatus, useSentEmails, useStudents } from "./queries";

type Tab = "send" | "sent";

const TAB_BASE = "px-3 py-2 text-sm border-b-2 -mb-px";

/**
 * Notes to students, at the bottom of the action plan. Each note is opened,
 * read and sent on its own, so the teacher stays the one who sends.
 */
export function StudentNotes() {
  const { batch, patternName, questionName } = useSession();
  const [tab, setTab] = useState<Tab>("send");
  const [reviewing, setReviewing] = useState<string | null>(null);
  const status = useEmailStatus();
  const students = useStudents();
  const sent = useSentEmails();

  const addresses = useMemo(
    () => new Map((students.data ?? []).map((s) => [s.learner_id, s.email])),
    [students.data],
  );
  const states = useMemo(() => latestState(sent.data), [sent.data]);

  // The first finding for each student, in the words used elsewhere in the app.
  const rows = useMemo(() => {
    if (!batch) return [];
    return batch.learners.flatMap((l) => {
      const d = batch.diagnoses.find((x) => x.learner_id === l.learner_id && x.taxonomy_node);
      return d
        ? [{ id: l.learner_id, name: l.learner_name, saw: `${questionName(d.question_id)}: ${patternName(d.taxonomy_node)}` }]
        : [];
    });
  }, [batch, patternName, questionName]);

  if (!batch) return null;
  const studentNotes = (sent.data ?? []).filter((e) => e.kind === "student").length;

  return (
    <Panel
      flush
      title="Notes to students"
      subtitle="Each note is drafted for you to read, change and send yourself."
    >
      <p className="px-4 py-2 text-sm text-ink-muted border-b border-line">
        {status.data
          ? status.data.gmail_configured && status.data.sender
            ? `Emails will be sent from ${status.data.sender}.`
            : "Gmail is not set up, so emails are saved here and not delivered."
          : "Checking how emails are sent."}
      </p>

      <div role="tablist" className="px-4 flex gap-1 border-b border-line">
        <button
          role="tab"
          aria-selected={tab === "send"}
          onClick={() => setTab("send")}
          className={`${TAB_BASE} ${tab === "send" ? "border-ink text-ink font-medium" : "border-transparent text-ink-muted"}`}
        >
          To send
        </button>
        <button
          role="tab"
          aria-selected={tab === "sent"}
          onClick={() => setTab("sent")}
          className={`${TAB_BASE} ${tab === "sent" ? "border-ink text-ink font-medium" : "border-transparent text-ink-muted"}`}
        >
          Sent <span className="num text-ink-faint">{studentNotes}</span>
        </button>
      </div>

      {tab === "send" ? (
        rows.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No student needs a note from this analysis.">
              A note is drafted only for students with a mistake pattern to talk about.
            </EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Email</th>
                  <th>What we saw</th>
                  <th>Status</th>
                  <th aria-label="Action" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="text-sm font-medium text-ink whitespace-nowrap">{r.name}</td>
                    <td>
                      <EmailAddress
                        key={addresses.get(r.id) ?? ""}
                        learnerId={r.id}
                        email={addresses.get(r.id) ?? ""}
                      />
                    </td>
                    <td className="text-sm text-ink-muted">{r.saw}</td>
                    <td>
                      <StateTag state={states.get(r.id) ?? "not_sent"} />
                    </td>
                    <td className="text-right">
                      <button className="btn btn-xs" onClick={() => setReviewing(r.id)}>
                        Review and send
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <SentList emails={sent.data ?? []} />
      )}

      {reviewing && <ReviewDialog learnerId={reviewing} onClose={() => setReviewing(null)} />}
    </Panel>
  );
}
