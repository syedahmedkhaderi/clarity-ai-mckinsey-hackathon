import { useQuery } from "@tanstack/react-query";
import { emailApi } from "../../api/email";
import { useSession } from "../../hooks/useSession";
import type { SentEmail } from "../../types/email";
import type { NoteState } from "./copy";

export function useEmailStatus() {
  return useQuery({ queryKey: ["email-status"], queryFn: emailApi.status });
}

/** Addresses for the class the current analysis belongs to. */
export function useStudents() {
  const { batch } = useSession();
  const classId = batch?.cohort_id ?? "";
  return useQuery({
    queryKey: ["students", classId],
    queryFn: () => emailApi.students(classId),
    enabled: classId !== "",
  });
}

/** Everything sent or saved for the current analysis. Test copies are included. */
export function useSentEmails() {
  const { batchId } = useSession();
  return useQuery({
    queryKey: ["email-sent", batchId],
    queryFn: () => emailApi.sent(batchId ?? ""),
    enabled: !!batchId,
  });
}

/** The newest note to each student, so a resend shows its own outcome. */
export function latestState(sent: SentEmail[] | undefined): Map<string, NoteState> {
  const latest = new Map<string, SentEmail>();
  for (const e of sent ?? []) {
    if (e.kind !== "student") continue;
    const seen = latest.get(e.learner_id);
    if (!seen || e.email_id > seen.email_id) latest.set(e.learner_id, e);
  }
  return new Map([...latest].map(([id, e]) => [id, e.status]));
}
