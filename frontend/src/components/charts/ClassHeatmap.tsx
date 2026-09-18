import type { CohortPatterns, LearnerContext } from "../../types";
import { CohortHeatmap } from "../CohortHeatmap";

/**
 * Students down the side, mistake patterns across the top. Placeholder that wraps
 * the original table; note the callback takes the student first.
 */
export function ClassHeatmap({
  patterns,
  learners,
  threshold,
  onCell,
}: {
  patterns: CohortPatterns;
  learners: LearnerContext[];
  threshold: number;
  onCell: (learnerId: string, nodeId: string) => void;
}) {
  return (
    <CohortHeatmap
      patterns={patterns}
      learners={learners}
      threshold={threshold}
      onCell={(nodeId, learnerId) => onCell(learnerId, nodeId)}
    />
  );
}
