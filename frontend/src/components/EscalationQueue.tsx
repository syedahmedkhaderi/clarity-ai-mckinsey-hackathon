import type { ReactNode } from "react";
import type { BatchResult, Diagnosis, Escalation, Mark, ReasonCode } from "../types";
import {
  REASON_LABELS,
  pct,
  scoreText,
  severityLabel,
  stripNodeIds,
  sure,
} from "../lib/format";
import { useSession } from "../hooks/useSession";
import { EvidenceSpan } from "./EvidenceSpan";
import { EmptyState } from "./ui/EmptyState";
import { Panel } from "./ui/Panel";
import { Tag } from "./ui/Tag";

/** The order the teacher meets them in: what is hardest to trust first. */
const GROUP_ORDER: ReasonCode[] = [
  "LOW_MARK_CONFIDENCE",
  "AMBIGUOUS_DIAGNOSIS",
  "LANGUAGE_BARRIER",
  "SPARSE_HISTORY",
  "BUDGET_OVERFLOW",
  "COUNTS_TOWARD_RECORD",
];

const GROUP_HINT: Record<ReasonCode, string> = {
  LOW_MARK_CONFIDENCE: "The answer was too hard to read for the system to trust its own mark.",
  AMBIGUOUS_DIAGNOSIS: "Two explanations fit the answer about equally well.",
  LANGUAGE_BARRIER:
    "The working is right. The wording is the problem, so this is not counted as a maths gap.",
  SPARSE_HISTORY: "Earlier tests are missing, so it cannot be sure the mistake keeps happening.",
  BUDGET_OVERFLOW: "These matter a lot but did not fit your time.",
  COUNTS_TOWARD_RECORD: "These marks would count on the student's record, so only you can decide.",
};

/** A diagnosis carries the runner-up's own confidence on the wire; types.ts does not list it yet. */
type WireDiagnosis = Diagnosis & { alternative_confidence?: number };

const NODE_ID = /^M\d{2}$/;

interface Reading {
  label: string;
  text: string;
  confidence?: number;
}

/** Corrections only make sense where the dialog can act on them. */
const CAN_CORRECT: ReasonCode[] = ["AMBIGUOUS_DIAGNOSIS", "LANGUAGE_BARRIER", "SPARSE_HISTORY"];

/**
 * The things handed to the teacher, grouped by reason. Each one shows both
 * readings the system was weighing and what it would have chosen if it had to
 * choose. A note that only says "I am unsure" wastes a teacher's time.
 */
export function EscalationQueue({
  escalations,
  onResolve,
  onOverride,
}: {
  escalations: Escalation[];
  onResolve: (e: Escalation) => void;
  onOverride: (e: Escalation) => void;
}) {
  const open = escalations.filter((e) => !e.resolved);
  const done = escalations.filter((e) => e.resolved);
  return (
    <div className="space-y-5">
      {open.length === 0 && <EmptyState title="Nothing is waiting for your decision." />}
      {GROUP_ORDER.map((code) => {
        const items = open.filter((e) => e.reason_code === code);
        if (!items.length) return null;
        return (
          <Panel
            key={code}
            flush
            title={REASON_LABELS[code]}
            subtitle={GROUP_HINT[code]}
            action={<span className="panel-sub shrink-0">{items.length} to decide</span>}
          >
            <ul className="divide-y divide-line">
              {items.map((e) => (
                <li key={e.escalation_id} className="px-4 py-4">
                  <Item e={e} onResolve={onResolve} onOverride={onOverride} />
                </li>
              ))}
            </ul>
          </Panel>
        );
      })}
      {done.length > 0 && <Decided items={done} />}
    </div>
  );
}

function Decided({ items }: { items: Escalation[] }) {
  const { learnerName, questionName } = useSession();
  return (
    <Panel flush title="Already decided">
      <ul className="divide-y divide-line">
        {items.map((e) => (
          <li key={e.escalation_id} className="px-4 py-2 flex flex-wrap items-baseline gap-2">
            <span className="text-sm text-ink-muted">
              {e.learner_id ? learnerName(e.learner_id) : e.subject}
              {e.question_id && `, ${questionName(e.question_id)}`}
            </span>
            <span className="ml-auto text-xs text-ink-faint">{REASON_LABELS[e.reason_code]}</span>
            <Tag>Accepted</Tag>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** What the batch already knows about one escalation: the answer, the marks and the readings. */
function evidenceFor(batch: BatchResult | null, e: Escalation) {
  const same = (x: { learner_id: string; question_id: string }) =>
    x.learner_id === e.learner_id && x.question_id === e.question_id;
  return {
    answer: batch?.submissions.find(same)?.answer,
    diagnosis: (batch?.all_diagnoses ?? batch?.diagnoses ?? []).find(same) as
      | WireDiagnosis
      | undefined,
    mark: (batch?.all_marks ?? batch?.marks ?? []).find(same) as Mark | undefined,
  };
}

function Item({
  e,
  onResolve,
  onOverride,
}: {
  e: Escalation;
  onResolve: (e: Escalation) => void;
  onOverride: (e: Escalation) => void;
}) {
  const s = useSession();
  const { answer, diagnosis, mark } = evidenceFor(s.batch, e);
  const plain = (text: string) => s.plain(stripNodeIds(text));
  const readings = readingsFor(e, diagnosis, mark, s.patternName, plain);
  const why = whyFor(e, diagnosis, s.batch, s.highSeverityFloor, s.learnerName, plain);
  const isBudget = e.reason_code === "BUDGET_OVERFLOW";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-sm font-medium text-ink">
          {isBudget || !e.learner_id ? plain(e.subject) : s.learnerName(e.learner_id)}
        </span>
        {e.question_id && (
          <span className="text-xs text-ink-faint">{s.questionName(e.question_id)}</span>
        )}
        <span className="ml-auto flex flex-wrap gap-2">
          {e.learner_id && CAN_CORRECT.includes(e.reason_code) && (
            <button className="btn btn-xs" onClick={() => onOverride(e)}>
              Correct this
            </button>
          )}
          <button className="btn btn-xs" onClick={() => onResolve(e)}>
            Accept its choice
          </button>
        </span>
      </div>

      {answer && (
        <Block label="What they wrote">
          <EvidenceSpan answer={answer} span={diagnosis?.evidence_span ?? ""} />
        </Block>
      )}

      {why && <p className="text-sm text-ink-muted">{why}</p>}

      {readings.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {readings.map((r) => (
            <div key={r.label} className="rounded border border-line px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-2xs uppercase tracking-wide text-ink-faint">{r.label}</span>
                {r.confidence !== undefined && (
                  <span className="num text-ink-muted">{sure(r.confidence)}</span>
                )}
              </div>
              <p className="text-sm text-ink mt-0.5">{r.text}</p>
            </div>
          ))}
        </div>
      )}

      <Block label="What the system would have chosen">
        <p className="text-sm text-ink">
          {choiceFor(e, diagnosis, mark, s.patternName, plain)}
        </p>
      </Block>
    </div>
  );
}

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded border border-line bg-surface-sunken px-3 py-2">
      <div className="text-2xs uppercase tracking-wide text-ink-faint mb-0.5">{label}</div>
      {children}
    </div>
  );
}

/** A node id reads as its plain name. Anything else is a sentence, so it is cleaned instead. */
function reading(
  candidate: string,
  patternName: (id: string) => string,
  plain: (t: string) => string,
): string {
  return NODE_ID.test(candidate) ? patternName(candidate) : plain(candidate);
}

function readingsFor(
  e: Escalation,
  d: WireDiagnosis | undefined,
  mark: Mark | undefined,
  patternName: (id: string) => string,
  plain: (t: string) => string,
): Reading[] {
  if (e.reason_code === "LOW_MARK_CONFIDENCE" || e.reason_code === "COUNTS_TOWARD_RECORD") {
    if (!mark) return [];
    return [
      {
        label: "Its mark",
        text: `${scoreText(mark.awarded)} of ${scoreText(mark.max_marks)} marks`,
        confidence: mark.confidence,
      },
    ];
  }
  const budget = e.reason_code === "BUDGET_OVERFLOW";
  const out: Reading[] = [];
  const add = (label: string, candidate: string | null, conf: number | undefined) => {
    if (candidate) {
      out.push({ label, text: reading(candidate, patternName, plain), confidence: conf });
    }
  };
  const a = d && d.taxonomy_node === e.candidate_a ? d.confidence : undefined;
  const b = d && d.alternative_node === e.candidate_b ? d.alternative_confidence : undefined;
  add(budget ? "Option A" : "Reading A", e.candidate_a, a);
  add(budget ? "Option B" : "Reading B", e.candidate_b, b);
  return out;
}

/** One plain sentence on why this was handed over, or null when the readings say it all. */
function whyFor(
  e: Escalation,
  d: WireDiagnosis | undefined,
  batch: BatchResult | null,
  highFloor: number,
  learnerName: (id: string) => string,
  plain: (t: string) => string,
): string | null {
  if (e.reason_code === "LANGUAGE_BARRIER") return plain(d?.reasoning || e.reasoning);
  if (e.reason_code === "SPARSE_HISTORY") {
    const ctx = batch?.learners.find((l) => l.learner_id === e.learner_id);
    if (!ctx) return null;
    const name = e.learner_id ? learnerName(e.learner_id) : "This student";
    return `Only ${pct(ctx.history_completeness)} of the earlier tests are on record for ${name}, so this may be new rather than something that keeps happening.`;
  }
  if (e.reason_code === "BUDGET_OVERFLOW") {
    const action = batch?.plan?.dropped.find((a) => a.title === e.subject);
    if (!action) return null;
    return `${severityLabel(action.severity, highFloor)}, but it needs ${action.cost_minutes} minutes and there was no time left.`;
  }
  return null;
}

function choiceFor(
  e: Escalation,
  d: WireDiagnosis | undefined,
  mark: Mark | undefined,
  patternName: (id: string) => string,
  plain: (t: string) => string,
): string {
  switch (e.reason_code) {
    case "LANGUAGE_BARRIER":
      return "Treat the maths as sound and record no maths gap. Help with the wording instead of re-teaching.";
    case "AMBIGUOUS_DIAGNOSIS":
      if (!e.candidate_a) break;
      return `Record ‘${reading(e.candidate_a, patternName, plain)}’ as the cause${
        d && d.taxonomy_node === e.candidate_a ? `, ${sure(d.confidence)}` : ""
      }.`;
    case "LOW_MARK_CONFIDENCE":
    case "COUNTS_TOWARD_RECORD":
      if (!mark) break;
      return `Give ${scoreText(mark.awarded)} of ${scoreText(mark.max_marks)} marks as a draft. It counts only when you confirm it.`;
    case "SPARSE_HISTORY":
      return "Treat it as a mistake that keeps happening, and plan for that.";
    case "BUDGET_OVERFLOW":
      return "Leave it out of this plan. Raise your minutes on Home to fit it in.";
  }
  return plain(e.would_have_decided);
}
