import type { ReasonCode } from "../types";

export const REASON_LABELS: Record<ReasonCode, string> = {
  LOW_MARK_CONFIDENCE: "Low mark confidence",
  AMBIGUOUS_DIAGNOSIS: "Ambiguous diagnosis",
  LANGUAGE_BARRIER: "Language barrier",
  SPARSE_HISTORY: "Sparse history",
  BUDGET_OVERFLOW: "Budget overflow",
  COUNTS_TOWARD_RECORD: "Counts toward record",
};

export const REASON_BLURB: Record<ReasonCode, string> = {
  LOW_MARK_CONFIDENCE: "The response could not be read against the scheme with enough certainty.",
  AMBIGUOUS_DIAGNOSIS: "Two explanations fit the evidence too closely to separate.",
  LANGUAGE_BARRIER: "The mathematics looks sound. The difficulty is in the language.",
  SPARSE_HISTORY: "A claim about recurrence rests on a record with gaps in it.",
  BUDGET_OVERFLOW: "Something important did not fit the facilitator's time.",
  COUNTS_TOWARD_RECORD: "This mark would count toward the learner's record.",
};

export const ACTION_LABELS: Record<string, string> = {
  group_reteach: "Group re-teach",
  peer_pairing: "Peer pairing",
  individual_followup: "Individual follow-up",
  feedback_review: "Feedback review",
};

export const AGENT_LABELS: Record<string, string> = {
  intake: "Intake",
  marker: "Marker",
  diagnostician: "Diagnostician",
  cohort_analyst: "Cohort analyst",
  planner: "Planner",
  reviewer: "Reviewer gate",
  graph: "Orchestrator",
  facilitator: "Facilitator",
};

export const ERROR_CLASS_LABELS: Record<string, string> = {
  conceptual: "Conceptual",
  procedural: "Procedural",
  computational: "Computational",
  notational: "Notational",
  language: "Language",
  unclassified: "Unclassified",
};

export function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function shortTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour12: false, minute: "2-digit", second: "2-digit" });
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
