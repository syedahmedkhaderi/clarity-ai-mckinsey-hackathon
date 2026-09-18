"""Pydantic models. These are the wire contract the frontend builds against."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ReasonCode = Literal[
    "LOW_MARK_CONFIDENCE",
    "AMBIGUOUS_DIAGNOSIS",
    "LANGUAGE_BARRIER",
    "SPARSE_HISTORY",
    "BUDGET_OVERFLOW",
    "COUNTS_TOWARD_RECORD",
]

ActionType = Literal["group_reteach", "peer_pairing", "individual_followup", "feedback_review"]
PatternKind = Literal["shared", "recurring", "emerging", "insufficient_data"]


class Submission(BaseModel):
    submission_id: str
    learner_id: str
    learner_name: str
    assessment_id: str
    question_id: str
    topic: str
    type: Literal["mcq", "written"]
    answer: str
    submitted_at: str


class LearnerContext(BaseModel):
    """What Intake knows about a learner before any marking happens."""

    learner_id: str
    learner_name: str
    returner: bool = False
    history_completeness: float = 1.0
    assessments_present: list[str] = Field(default_factory=list)
    assessments_expected: list[str] = Field(default_factory=list)
    prior_nodes: dict[str, list[str]] = Field(default_factory=dict)
    low_confidence_history: bool = False
    note: str | None = None


class Mark(BaseModel):
    question_id: str
    learner_id: str
    awarded: float
    max_marks: float
    confidence: float
    criteria_met: list[str] = Field(default_factory=list)
    criteria_missed: list[str] = Field(default_factory=list)
    provisional: bool = True
    source: Literal["deterministic", "model", "fallback"] = "deterministic"
    summative: bool = False


class Diagnosis(BaseModel):
    question_id: str
    learner_id: str
    taxonomy_node: str | None = None
    alternative_node: str | None = None
    error_class: str = "unclassified"
    confidence: float = 0.0
    evidence_span: str = ""
    reasoning: str = ""
    language_flag: bool = False
    source: Literal["distractor_map", "model", "fallback"] = "fallback"
    topic: str = ""


class NodePattern(BaseModel):
    node_id: str
    label: str
    topic: str
    error_class: str
    learner_ids: list[str]
    count: int
    cohort_size: int
    share: float
    kind: PatternKind
    recurring_learner_ids: list[str] = Field(default_factory=list)
    downweighted_learner_ids: list[str] = Field(default_factory=list)
    teaching_problem: bool = False
    note: str | None = None


class CohortPatterns(BaseModel):
    cohort_id: str
    assessment_id: str
    cohort_size: int
    nodes: list[NodePattern] = Field(default_factory=list)
    skipped_topics: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class PlannedAction(BaseModel):
    action_id: str
    type: ActionType
    title: str
    node_id: str | None = None
    learner_ids: list[str] = Field(default_factory=list)
    cost_minutes: int = 0
    severity: float = 0.0
    justification: str = ""
    facilitator_script: str | None = None
    scheduled: bool = True
    drop_reason: str | None = None


class DraftedFeedback(BaseModel):
    learner_id: str
    learner_name: str
    node_ids: list[str] = Field(default_factory=list)
    body: str = ""
    approved: bool = False


class InterventionPlan(BaseModel):
    batch_id: str
    budget_minutes: int
    minutes_used: int = 0
    scheduled: list[PlannedAction] = Field(default_factory=list)
    dropped: list[PlannedAction] = Field(default_factory=list)
    feedback: list[DraftedFeedback] = Field(default_factory=list)
    goal: str = ""
    generated_at: str = ""


class Escalation(BaseModel):
    escalation_id: str
    reason_code: ReasonCode
    raised_by: str
    learner_id: str | None = None
    question_id: str | None = None
    subject: str = ""
    reasoning: str = ""
    candidate_a: str | None = None
    candidate_b: str | None = None
    would_have_decided: str = ""
    resolved: bool = False
    resolution: str | None = None


class TraceEvent(BaseModel):
    agent: str
    action: str
    detail: str
    timestamp: str
    duration_ms: int = 0
    level: Literal["info", "decision", "escalation", "warning"] = "info"


class Override(BaseModel):
    type: Literal["mark", "diagnosis", "learner_unavailable"]
    target_id: str
    new_value: str | None = None
    reason: str = ""
    created_at: str = ""


class PlanChange(BaseModel):
    kind: Literal["added", "removed", "rescheduled", "budget"]
    detail: str
    action_id: str | None = None
