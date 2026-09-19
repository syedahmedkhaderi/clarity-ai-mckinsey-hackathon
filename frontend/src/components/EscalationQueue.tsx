import clsx from "clsx";
import { useState, type ReactNode } from "react";
import type { BatchResult, Diagnosis, Escalation, Mark, ReasonCode } from "../types";
import {
  REASON_LABELS,
  pct,
  scoreText,
  severityLabel,
  stripNodeIds,
  sure,
} from "../lib/format";
import { CORRECTED_RESOLUTION, DECIDED_FLASH_MS, useSession, type DecidedKind } from "../hooks/useSession";
import { EvidenceSpan } from "./EvidenceSpan";
import { EmptyState } from "./ui/EmptyState";
import { Panel } from "./ui/Panel";
import { Tag } from "./ui/Tag";
import { Tick } from "./ui/Tick";

/** The fold starts once the tick has had time to be seen, and ends as the card leaves the queue. */
const FOLD_MS = 520;

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
  const { justDecided } = useSession();
  // A card decided a moment ago stays in its group until its tick and fold have played.
  const open = escalations.filter((e) => !e.resolved || justDecided[e.escalation_id]);
  const done = escalations.filter((e) => e.resolved && !justDecided[e.escalation_id]);
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
            tone="flag"
            title={REASON_LABELS[code]}
            subtitle={GROUP_HINT[code]}
            action={
              <span className="count-flag shrink-0">
                {items.filter((e) => !justDecided[e.escalation_id]).length}
              </span>
            }
          >
            {/* Each decision is its own card on a grey ground, so one student never runs into the next. */}
            <ul className="space-y-3 bg-surface-sunken p-3 md:p-4">
              {items.map((e) => {
                const decided = justDecided[e.escalation_id];
                return (
                  <li
                    key={e.escalation_id}
                    className={clsx(
                      "overflow-hidden rounded border bg-surface",
                      decided ? "anim-leave border-agent-line" : "border-line-strong",
                    )}
                    style={
                      decided
                        ? { animationDelay: `${DECIDED_FLASH_MS[decided] - FOLD_MS}ms` }
                        : undefined
                    }
                  >
                    <Item e={e} decided={decided} onResolve={onResolve} onOverride={onOverride} />
                  </li>
                );
              })}
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
          <li key={e.escalation_id} className="anim-rise px-4 py-2 flex flex-wrap items-baseline gap-2">
            <span className="text-sm text-ink-muted">
              {e.learner_id ? learnerName(e.learner_id) : e.subject}
              {e.question_id && `, ${questionName(e.question_id)}`}
            </span>
            <span className="ml-auto text-xs text-ink-faint">{REASON_LABELS[e.reason_code]}</span>
            {e.resolution?.startsWith(CORRECTED_RESOLUTION) ? (
              <Tag tone="agent">Corrected</Tag>
            ) : (
              <Tag>Accepted</Tag>
            )}
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
  decided,
  onResolve,
  onOverride,
}: {
  e: Escalation;
  decided?: DecidedKind;
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
    <div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-surface-head px-4 py-2.5">
        <span className="text-sm font-medium text-ink">
          {isBudget || !e.learner_id ? plain(e.subject) : s.learnerName(e.learner_id)}
        </span>
        {e.question_id && (
          <span className="text-xs text-ink-faint">{s.questionName(e.question_id)}</span>
        )}
        {decided ? (
          <span role="status" className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-agent">
            <Tick />
            <span className="anim-fade" style={{ animationDelay: "250ms" }}>
              {decided === "corrected" ? "Corrected" : "Accepted"}
            </span>
          </span>
        ) : (
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
        )}
      </div>

      <div className="space-y-3 p-4">
      {answer && (
        <div>
          <Label>What they wrote</Label>
          <EvidenceSpan answer={answer} span={diagnosis?.evidence_span ?? ""} />
        </div>
      )}

      {why && <Why text={why} />}

      {readings.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {readings.map((r) => (
            <div key={r.label} className="rounded border border-line-strong bg-surface px-3 py-2">
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

      <div className="rounded border border-agent-line border-l-[3px] border-l-agent bg-agent-soft px-3 py-2">
        <div className="mb-0.5 text-2xs font-medium uppercase tracking-wide text-agent">
          What the system would have chosen
        </div>
        <p className="text-sm text-ink">
          {choiceFor(e, diagnosis, mark, s.patternName, plain)}
        </p>
      </div>
      </div>
    </div>
  );
}

/** The system's reasoning is long; it waits behind its label until the teacher wants it. */
function Why({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-2xs uppercase tracking-wide text-ink-muted hover:text-ink"
      >
        <span className="grid h-4 w-4 place-items-center rounded-sm border border-line-strong bg-surface text-xs leading-none">
          {open ? "-" : "+"}
        </span>
        Why it came to you
      </button>
      {open && <p className="mt-1 text-sm text-ink-muted">{text}</p>}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <div className="mb-1 text-2xs uppercase tracking-wide text-ink-faint">{children}</div>;
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
    return `${severityLabel(action.severity, highFloor)}, but the planner ranked other work above it.`;
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
      return "Keep it lower down the action plan.";
  }
  return plain(e.would_have_decided);
}
