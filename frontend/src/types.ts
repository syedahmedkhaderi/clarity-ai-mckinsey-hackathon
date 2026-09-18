// Mirrors backend/models.py. Any change there must be reflected here.

export type ReasonCode =
  | "LOW_MARK_CONFIDENCE"
  | "AMBIGUOUS_DIAGNOSIS"
  | "LANGUAGE_BARRIER"
  | "SPARSE_HISTORY"
  | "BUDGET_OVERFLOW"
  | "COUNTS_TOWARD_RECORD";

export type ActionType =
  | "group_reteach"
  | "peer_pairing"
  | "individual_followup"
  | "feedback_review";

export type PatternKind = "shared" | "recurring" | "emerging" | "insufficient_data";

export interface Submission {
  submission_id: string;
  learner_id: string;
  learner_name: string;
  assessment_id: string;
  question_id: string;
  topic: string;
  type: "mcq" | "written";
  answer: string;
  submitted_at: string;
}

export interface LearnerContext {
  learner_id: string;
  learner_name: string;
  returner: boolean;
  history_completeness: number;
  assessments_present: string[];
  assessments_expected: string[];
  prior_nodes: Record<string, string[]>;
  low_confidence_history: boolean;
  note: string | null;
}

export interface Mark {
  question_id: string;
  learner_id: string;
  awarded: number;
  max_marks: number;
  confidence: number;
  criteria_met: string[];
  criteria_missed: string[];
  provisional: boolean;
  source: "deterministic" | "model" | "fallback";
  summative: boolean;
}

export interface Diagnosis {
  question_id: string;
  learner_id: string;
  taxonomy_node: string | null;
  alternative_node: string | null;
  error_class: string;
  confidence: number;
  evidence_span: string;
  reasoning: string;
  language_flag: boolean;
  source: "distractor_map" | "model" | "fallback";
  topic: string;
}

export interface NodePattern {
  node_id: string;
  label: string;
  topic: string;
  error_class: string;
  learner_ids: string[];
  count: number;
  cohort_size: number;
  share: number;
  kind: PatternKind;
  recurring_learner_ids: string[];
  downweighted_learner_ids: string[];
  teaching_problem: boolean;
  note: string | null;
}

export interface CohortPatterns {
  cohort_id: string;
  assessment_id: string;
  cohort_size: number;
  nodes: NodePattern[];
  skipped_topics: string[];
  notes: string[];
}

export interface PlannedAction {
  action_id: string;
  type: ActionType;
  title: string;
  node_id: string | null;
  learner_ids: string[];
  cost_minutes: number;
  severity: number;
  justification: string;
  facilitator_script: string | null;
  scheduled: boolean;
  drop_reason: string | null;
}

export interface DraftedFeedback {
  learner_id: string;
  learner_name: string;
  node_ids: string[];
  body: string;
  approved: boolean;
}

export interface InterventionPlan {
  batch_id: string;
  budget_minutes: number;
  minutes_used: number;
  scheduled: PlannedAction[];
  dropped: PlannedAction[];
  feedback: DraftedFeedback[];
  goal: string;
  generated_at: string;
}

export interface Escalation {
  escalation_id: string;
  reason_code: ReasonCode;
  raised_by: string;
  learner_id: string | null;
  question_id: string | null;
  subject: string;
  reasoning: string;
  candidate_a: string | null;
  candidate_b: string | null;
  would_have_decided: string;
  resolved: boolean;
  resolution: string | null;
}

export interface TraceEvent {
  agent: string;
  action: string;
  detail: string;
  timestamp: string;
  duration_ms: number;
  level: "info" | "decision" | "escalation" | "warning";
}

export interface PlanChange {
  kind: "added" | "removed" | "rescheduled" | "budget";
  detail: string;
  action_id: string | null;
}

export interface BatchResult {
  batch_id: string;
  assessment_id: string;
  cohort_id: string;
  facilitator_minutes: number;
  status: string;
  submissions: Submission[];
  learners: LearnerContext[];
  marks: Mark[];
  diagnoses: Diagnosis[];
  patterns: CohortPatterns | null;
  plan: InterventionPlan | null;
  escalations: Escalation[];
  trace: TraceEvent[];
  overrides: unknown[];
  changes: PlanChange[];
  all_marks?: Mark[];
  all_diagnoses?: Diagnosis[];
}

export interface TaxonomyNode {
  id: string;
  topic: string;
  error_class: string;
  label: string;
  description: string;
  typical_evidence: string;
  remediation_hint: string;
}

export interface Taxonomy {
  version: string;
  subject: string;
  topics: { id: string; label: string }[];
  error_classes: { id: string; label: string; description: string }[];
  nodes: TaxonomyNode[];
}

export interface Course {
  id: string;
  name: string;
  term: string;
  enrolled: number;
}

export interface Assignment {
  id: string;
  course_id: string;
  name: string;
  points_possible: number;
  question_count: number;
  submission_count: number;
  expected_count: number;
  topics: string[];
  due_at: string;
}

export interface Question {
  question_id: string;
  topic: string;
  type: "mcq" | "written";
  max_marks: number;
  prompt: string;
  model_answer?: string;
  scheme?: { marks: number; criterion: string }[];
  options?: Record<string, string>;
  correct?: string;
  distractor_map?: Record<string, string>;
}

/** A row of backend/db.py error_profile, as returned by /api/learner/{id}/profile. */
export interface ProfileEntry {
  learner_id: string;
  assessment_id: string;
  question_id: string;
  taxonomy_node: string;
  error_class: string;
  confidence: number;
  evidence_span: string;
  reasoning: string;
  language_flag: number;
  batch_id: string;
}

export interface LearnerProfile {
  learner_id: string;
  name: string;
  context: LearnerContext | null;
  assessments: Record<string, ProfileEntry[]>;
  recurring_nodes: string[];
  entries: ProfileEntry[];
}

export interface Health {
  status: string;
  mode: string;
  graph: {
    nodes: string[];
    edges: [string, string][];
    reviewer_gated: string[];
    replan_entry: string;
  };
  thresholds: Record<string, number>;
}
