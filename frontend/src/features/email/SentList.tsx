import { Fragment, useState } from "react";
import { EmptyState } from "../../components/ui/EmptyState";
import { Tag } from "../../components/ui/Tag";
import type { SentEmail } from "../../types/email";
import { whenLabel } from "./copy";
import { StateTag } from "./parts";

/** Every note sent or saved for this analysis, newest first, with the text on demand. */
export function SentList({ emails }: { emails: SentEmail[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (emails.length === 0) {
    return (
      <div className="p-4">
        <EmptyState title="Nothing has been sent yet.">
          Notes you send or save from the To send tab appear here.
        </EmptyState>
      </div>
    );
  }
  const rows = [...emails].sort((a, b) => b.email_id - a.email_id);

  return (
    <div className="overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Student</th>
            <th>To</th>
            <th>Subject</th>
            <th>Status</th>
            <th aria-label="Message" />
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const expanded = open === e.email_id;
            return (
              <Fragment key={e.email_id}>
                <tr>
                  <td className="text-xs text-ink-muted whitespace-nowrap">{whenLabel(e.created_at)}</td>
                  <td className="text-sm">
                    {e.kind === "test_copy" ? (
                      <Tag>Test copy</Tag>
                    ) : (
                      <span className="font-medium text-ink">{e.name}</span>
                    )}
                  </td>
                  <td className="text-sm text-ink-muted">{e.to_address || "No address"}</td>
                  <td className="text-sm">{e.subject}</td>
                  <td>
                    <StateTag state={e.status} />
                  </td>
                  <td className="text-right">
                    <button
                      className="text-xs text-ink-muted underline"
                      aria-expanded={expanded}
                      onClick={() => setOpen(expanded ? null : e.email_id)}
                    >
                      {expanded ? "Hide message" : "Show message"}
                    </button>
                  </td>
                </tr>
                {expanded && (
                  <tr>
                    <td colSpan={6} className="bg-surface-raised">
                      <p className="text-sm text-ink whitespace-pre-wrap">{e.body}</p>
                      {e.reason && <p className="text-xs text-ink-faint mt-2">{e.reason}</p>}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
