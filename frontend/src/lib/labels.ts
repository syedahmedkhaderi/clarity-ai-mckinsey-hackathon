import type { PatternKind, PlanChange, ReasonCode } from "../types";

/**
 * The teacher-facing glossary. Wire fields keep their developer names because the
 * API contract pins them; this file is the only place they are turned into words
 * a maths teacher would use. The old term is in each comment.
 */

/** Reason codes. Old: the raw code, or "Ambiguous diagnosis" and friends. */
export const REASON_LABELS: Record<ReasonCode, string> = {
  LOW_MARK_CONFIDENCE: "Hard to read",
  AMBIGUOUS_DIAGNOSIS: "Two possible causes",
  LANGUAGE_BARRIER: "Wording, not maths",
  SPARSE_HISTORY: "Missing earlier tests",
  BUDGET_OVERFLOW: "Did not fit your time",
  COUNTS_TOWARD_RECORD: "Would count on the record",
};

export const REASON_BLURB: Record<ReasonCode, string> = {
  LOW_MARK_CONFIDENCE: "The answer could not be read against the marking scheme with enough certainty.",
  AMBIGUOUS_DIAGNOSIS: "Two explanations fit the answer too closely to tell apart.",
  LANGUAGE_BARRIER: "The maths looks sound. The difficulty is in how it was written.",
  SPARSE_HISTORY: "A claim that a mistake keeps happening rests on a record with gaps in it.",
  BUDGET_OVERFLOW: "Something important did not fit the time you have.",
  COUNTS_TOWARD_RECORD: "This mark would count on the student's record.",
};

/** Old: group_reteach and friends. */
export const ACTION_LABELS: Record<string, string> = {
  group_reteach: "Re-teach the class",
  peer_pairing: "Pair students up",
  individual_followup: "One-to-one catch-up",
  feedback_review: "Check a feedback note",
};

/** Old: the graph node names. */
export const AGENT_LABELS: Record<string, string> = {
  intake: "Reading the class",
  marker: "Marking",
  diagnostician: "Finding mistakes",
  cohort_analyst: "Class picture",
  planner: "Planning",
  reviewer: "Safety check",
  graph: "Coordinator",
  facilitator: "You",
};

/** Old: Conceptual, Procedural and so on. */
export const ERROR_CLASS_LABELS: Record<string, string> = {
  conceptual: "Misunderstood the idea",
  procedural: "Wrong steps",
  computational: "Arithmetic slip",
  notational: "Wrote it wrongly",
  language: "Wording",
  unclassified: "Not sorted yet",
};

/** Old: shared, recurring, emerging, insufficient_data. */
export const PATTERN_KIND_LABELS: Record<PatternKind, string> = {
  shared: "Whole class",
  recurring: "Keeps happening",
  emerging: "New this test",
  insufficient_data: "Too few students to tell",
};

/** Old: provisional and Approve. The API still calls the state "provisional". */
export const STATUS_LABELS = {
  draft: "Draft",
  confirmed: "Confirmed",
  confirm: "Confirm",
} as const;

/** Old: added, removed, rescheduled, budget. */
export const PLAN_CHANGE_LABELS: Record<PlanChange["kind"], string> = {
  added: "Added",
  removed: "Removed",
  rescheduled: "Moved",
  budget: "Time changed",
};

/** Old: distractor_map, model, fallback. */
export const DIAGNOSIS_SOURCE_LABELS: Record<string, string> = {
  distractor_map: "read from the marking scheme, no AI used",
  model: "read by the AI",
  fallback: "read by the built-in rules",
};

/** Shown when an uploaded test is selected and no AI key is set up. */
export const AI_KEY_REQUIRED_SENTENCE =
  "Analysing your own tests needs an AI key. No key is set up, so this test cannot be run yet.";

/** Fallback for health.thresholds.high_severity_floor while health is loading. */
export const DEFAULT_HIGH_SEVERITY_FLOOR = 0.75;

/** How far below the high floor an action can fall and still be Medium. */
export const SEVERITY_STEP = 0.25;

export type SeverityLevel = "high" | "medium" | "low";

export function severityLevel(
  severity: number,
  highFloor: number = DEFAULT_HIGH_SEVERITY_FLOOR,
): SeverityLevel {
  if (severity >= highFloor) return "high";
  if (severity >= highFloor - SEVERITY_STEP) return "medium";
  return "low";
}

const SEVERITY_LABELS: Record<SeverityLevel, string> = {
  high: "High priority",
  medium: "Medium priority",
  low: "Low priority",
};

/** Old: "sev 0.72". */
export function severityLabel(
  severity: number,
  highFloor: number = DEFAULT_HIGH_SEVERITY_FLOOR,
): string {
  return SEVERITY_LABELS[severityLevel(severity, highFloor)];
}
