import type { InsightsHistory } from "../types/insights";
import { get } from "./http";

export const insightsApi = {
  history: (courseId = "C1") =>
    get<InsightsHistory>(`/insights/history?course_id=${encodeURIComponent(courseId)}`),
};
