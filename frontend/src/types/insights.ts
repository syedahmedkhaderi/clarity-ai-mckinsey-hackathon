export interface HistoryLearner {
  learner_id: string;
  name: string;
  awarded: number;
  /** True unless every mark this student has on the test has been confirmed. */
  provisional: boolean;
}

export interface HistoryTest {
  assessment_id: string;
  name: string;
  points_possible: number;
  learners: HistoryLearner[];
}

export interface InsightsHistory {
  tests: HistoryTest[];
}
