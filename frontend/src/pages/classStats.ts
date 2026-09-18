import type { BatchResult, InterventionPlan, Mark, NodePattern } from "../types";

/**
 * Sums and shares for the Home and Class pages. Everything is worked out from
 * `all_marks`, because `marks` leaves out the items handed to the teacher and a
 * total that quietly drops them would understate a student's score.
 */
export function marksOf(batch: BatchResult): Mark[] {
  return batch.all_marks ?? batch.marks;
}

export interface StudentScore {
  learnerId: string;
  name: string;
  awarded: number;
  possible: number;
}

export function studentScores(batch: BatchResult): StudentScore[] {
  const byLearner = new Map<string, { awarded: number; possible: number }>();
  for (const m of marksOf(batch)) {
    const sum = byLearner.get(m.learner_id) ?? { awarded: 0, possible: 0 };
    sum.awarded += m.awarded;
    sum.possible += m.max_marks;
    byLearner.set(m.learner_id, sum);
  }
  return batch.learners
    .filter((l) => byLearner.has(l.learner_id))
    .map((l) => ({ learnerId: l.learner_id, name: l.learner_name, ...byLearner.get(l.learner_id)! }));
}

export function marksLost(scores: StudentScore[]): { lost: number; possible: number } {
  const possible = scores.reduce((a, s) => a + s.possible, 0);
  const awarded = scores.reduce((a, s) => a + s.awarded, 0);
  return { lost: possible - awarded, possible };
}

export interface QuestionRow {
  number: number;
  label: string;
  correct: number;
  total: number;
}

/** A question counts as right when the full marks were awarded. */
export function questionRows(batch: BatchResult, topicName: (id: string) => string): QuestionRow[] {
  const topicOf = new Map<string, string>();
  for (const s of batch.submissions) if (!topicOf.has(s.question_id)) topicOf.set(s.question_id, s.topic);

  const byQuestion = new Map<string, { correct: number; total: number }>();
  for (const m of marksOf(batch)) {
    const row = byQuestion.get(m.question_id) ?? { correct: 0, total: 0 };
    row.total += 1;
    if (m.awarded >= m.max_marks) row.correct += 1;
    byQuestion.set(m.question_id, row);
  }

  return [...byQuestion.entries()]
    .map(([id, row], index) => {
      const topic = topicOf.get(id) ?? "";
      const number = Number(/Q(\d+)$/.exec(id)?.[1] ?? index + 1);
      return { number, label: topic ? topicName(topic) : "No topic set", ...row };
    })
    .sort((a, b) => a.number - b.number);
}

/** Patterns with enough students behind them to name, biggest first. */
export function namedPatterns(nodes: NodePattern[]): NodePattern[] {
  return nodes
    .filter((n) => n.kind !== "insufficient_data" && n.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function droppedMinutes(plan: InterventionPlan | null): number {
  return plan ? plan.dropped.reduce((a, d) => a + d.cost_minutes, 0) : 0;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** 9 stays 9, 9.43 becomes 9.4. */
export function roundOne(n: number): string {
  return Number.isInteger(n) ? `${n}` : n.toFixed(1);
}
