import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { emailApi } from "../../api/email";
import { ApiError } from "../../api/http";
import { useSession } from "../../hooks/useSession";
import type { EmailDraft, SendResult } from "../../types/email";
import { ALREADY_SENT_QUESTION, SEND_PROBLEMS } from "./copy";
import { StateTag } from "./parts";

const FIELD = "w-full rounded border border-line-strong px-2 py-1.5 text-sm disabled:bg-surface-sunken";

/**
 * The teacher reads and edits one note before anything leaves. Every note is
 * reviewed here one at a time; there is deliberately no send-all.
 */
export function ReviewDialog({ learnerId, onClose }: { learnerId: string; onClose: () => void }) {
  const { batchId, learnerName } = useSession();
  const draft = useQuery({
    queryKey: ["email-draft", batchId, learnerId],
    queryFn: () => emailApi.draft(batchId ?? "", learnerId),
    enabled: !!batchId,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 grid place-items-center p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-title"
        className="panel w-full max-w-2xl shadow-lg flex flex-col max-h-[90vh]"
      >
        {draft.data && batchId ? (
          <DraftForm draft={draft.data} batchId={batchId} onClose={onClose} />
        ) : (
          <>
            <div className="panel-head">
              <div id="note-title" className="panel-title">
                Note to {learnerName(learnerId)}
              </div>
            </div>
            <div className="p-4 text-sm text-ink-muted">
              {draft.isError
                ? draft.error instanceof ApiError
                  ? draft.error.message
                  : "The note could not be drafted."
                : "Drafting the note."}
            </div>
            <div className="px-4 py-3 border-t border-line flex justify-end bg-surface-raised">
              <button className="btn" onClick={onClose}>
                {draft.isError ? "Close" : "Cancel"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

type Problem = { where: "to" | "body" | "general"; text: string };

function toProblem(e: unknown): Problem {
  if (e instanceof ApiError) {
    if (e.code && SEND_PROBLEMS[e.code]) return { where: "body", text: SEND_PROBLEMS[e.code] };
    if (e.code === "BAD_EMAIL") return { where: "to", text: e.message };
    return { where: "general", text: e.message };
  }
  return { where: "general", text: "The note could not be sent. Please try again." };
}

function DraftForm({
  draft,
  batchId,
  onClose,
}: {
  draft: EmailDraft;
  batchId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [to, setTo] = useState(draft.to);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [askResend, setAskResend] = useState(false);
  const [sent, setSent] = useState<SendResult | null>(null);
  const [testResult, setTestResult] = useState<SendResult | null>(null);

  const refreshSent = () => qc.invalidateQueries({ queryKey: ["email-sent"] });

  const send = useMutation({
    mutationFn: (resend: boolean) =>
      emailApi.send({
        batch_id: batchId,
        learner_id: draft.learner_id,
        to: to.trim(),
        subject,
        body,
        resend: resend || undefined,
      }),
    onSuccess: (result) => {
      setSent(result);
      setAskResend(false);
      setProblem(null);
      refreshSent();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409 && e.code === "ALREADY_SENT") {
        setAskResend(true);
        setProblem(null);
      } else {
        setAskResend(false);
        setProblem(toProblem(e));
      }
    },
  });

  const testCopy = useMutation({
    mutationFn: () => emailApi.testCopy(subject, body),
    onSuccess: (result) => {
      setTestResult(result);
      setProblem(null);
      refreshSent();
    },
    onError: (e) => setProblem(toProblem(e)),
  });

  const busy = send.isPending || testCopy.isPending;
  const locked = sent !== null;
  const ready = to.trim() !== "" && subject.trim() !== "" && body.trim() !== "";
  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    setProblem(null);
    setAskResend(false);
  };

  return (
    <>
      <div className="panel-head">
        <div>
          <div id="note-title" className="panel-title">
            Note to {draft.name}
          </div>
          <div className="panel-sub">
            Read it through and change anything you like. Nothing is sent until you press Send.
            Sending a note does not change any marks.
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4 overflow-y-auto">
        <label className="block">
          <span className="block text-xs text-ink-muted mb-1">To</span>
          <input
            type="email"
            value={to}
            disabled={locked}
            onChange={(e) => edit(setTo)(e.target.value)}
            className={FIELD}
          />
          {problem?.where === "to" && <p className="text-xs text-flag mt-1">{problem.text}</p>}
        </label>

        <label className="block">
          <span className="block text-xs text-ink-muted mb-1">Subject</span>
          <input
            value={subject}
            disabled={locked}
            onChange={(e) => edit(setSubject)(e.target.value)}
            className={FIELD}
          />
        </label>

        <label className="block">
          <span className="block text-xs text-ink-muted mb-1">Message</span>
          <textarea
            value={body}
            disabled={locked}
            onChange={(e) => edit(setBody)(e.target.value)}
            rows={12}
            className={`${FIELD} resize-y`}
          />
          {problem?.where === "body" && <p className="text-xs text-flag mt-1">{problem.text}</p>}
        </label>

        {askResend && (
          <div className="rounded border border-flag-line bg-flag-soft p-3 flex items-center justify-between gap-3">
            <p className="text-sm text-flag">{ALREADY_SENT_QUESTION}</p>
            <div className="flex gap-2 shrink-0">
              <button className="btn btn-xs" onClick={() => setAskResend(false)} disabled={busy}>
                Not now
              </button>
              <button className="btn btn-xs btn-primary" onClick={() => send.mutate(true)} disabled={busy}>
                Send another
              </button>
            </div>
          </div>
        )}

        {problem?.where === "general" && <p className="text-sm text-flag">{problem.text}</p>}
        {sent && <Outcome label="This note" result={sent} />}
        {testResult && <Outcome label="Test copy" result={testResult} />}
      </div>

      <div className="px-4 py-3 border-t border-line flex justify-end gap-2 bg-surface-raised">
        {locked ? (
          <button className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        ) : (
          <>
            <button className="btn" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="btn" onClick={() => testCopy.mutate()} disabled={busy || !subject.trim() || !body.trim()}>
              {testCopy.isPending ? "Sending a test copy" : "Send a test copy to me"}
            </button>
            <button className="btn btn-primary" onClick={() => send.mutate(false)} disabled={busy || !ready}>
              {send.isPending ? "Sending" : "Send"}
            </button>
          </>
        )}
      </div>
    </>
  );
}

/** The server's own sentence, so "saved" is never dressed up as "delivered". */
function Outcome({ label, result }: { label: string; result: SendResult }) {
  return (
    <div className="rounded border border-line bg-surface-sunken p-3 flex items-start gap-3">
      <StateTag state={result.status} />
      <p className="text-sm text-ink">
        <span className="text-ink-muted">{label}: </span>
        {result.message}
      </p>
    </div>
  );
}
