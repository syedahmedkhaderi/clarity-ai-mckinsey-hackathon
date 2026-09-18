import type { SendResult } from "../../types/email";

/** What the teacher reads for each delivery state. Not sent is the absence of a record. */
export type NoteState = "not_sent" | SendResult["status"];

export const NOTE_STATE: Record<NoteState, { label: string; tone: "neutral" | "agent" | "flag" }> = {
  not_sent: { label: "Not sent", tone: "neutral" },
  delivered: { label: "Sent", tone: "agent" },
  saved: { label: "Saved, not delivered", tone: "flag" },
  failed: { label: "Not delivered", tone: "flag" },
};

/** The guard's codes turned into what to change in the note. */
export const SEND_PROBLEMS: Record<string, string> = {
  NODE_ID_IN_TEXT:
    "This note contains an internal code, such as M01. Please replace it with plain words.",
  MARKS_IN_TEXT:
    "This note mentions a mark or score. Marks are still drafts, so please take them out.",
};

export const ALREADY_SENT_QUESTION =
  "This student already has a note for this test. Send another?";

export function whenLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
