import type { BatchResult, Mark, NodePattern } from "../types";

/**
 * Sums and shares for the Home page. Everything is worked out from
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

/** Patterns with enough students behind them to name, biggest first. */
export function namedPatterns(nodes: NodePattern[]): NodePattern[] {
  return nodes
    .filter((n) => n.kind !== "insufficient_data" && n.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** 9 stays 9, 9.43 becomes 9.4. */
export function roundOne(n: number): string {
  return Number.isInteger(n) ? `${n}` : n.toFixed(1);
}
