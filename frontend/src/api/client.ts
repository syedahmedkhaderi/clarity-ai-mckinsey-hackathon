import type {
  Assignment,
  BatchResult,
  Course,
  Health,
  LearnerProfile,
  Question,
  Taxonomy,
  TraceEvent,
} from "../types";
import { get, post } from "./http";

export { ApiError } from "./http";

export const api = {
  health: () => get<Health>("/health"),
  courses: () => get<Course[]>("/lms/courses"),
  assignments: (courseId: string) => get<Assignment[]>(`/lms/courses/${courseId}/assignments`),
  taxonomy: () => get<Taxonomy>("/taxonomy"),
  questions: (assessmentId: string) => get<Question[]>(`/assessments/${assessmentId}/questions`),
  profile: (learnerId: string) => get<LearnerProfile>(`/learner/${learnerId}/profile`),

  runBatch: (assessment_id: string, cohort_id: string, facilitator_minutes: number) =>
    post<{ batch_id: string; status: string }>("/batch/run", {
      assessment_id,
      cohort_id,
      facilitator_minutes,
    }),
  batch: (batchId: string) => get<BatchResult>(`/batch/${batchId}`),
  trace: (batchId: string, since: number) =>
    get<{ batch_id: string; status: string; total: number; events: TraceEvent[] }>(
      `/batch/${batchId}/trace?since=${since}`,
    ),
  override: (
    batchId: string,
    body: { type: string; target_id: string; new_value?: string | null; reason: string },
  ) => post<BatchResult>(`/batch/${batchId}/override`, body),
  approve: (batchId: string, item_ids: string[]) =>
    post<{ approved: number }>(`/batch/${batchId}/approve`, { item_ids }),
  resolve: (batchId: string, escalation_id: string, resolution: string) =>
    post<{ resolved: boolean }>(`/batch/${batchId}/resolve`, { escalation_id, resolution }),
};
