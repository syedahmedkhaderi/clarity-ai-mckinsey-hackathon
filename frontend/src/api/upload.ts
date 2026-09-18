import type {
  SavedTest,
  TemplateName,
  UploadPreview,
  UploadRequest,
  UploadedTestRow,
} from "../types/upload";
import { API_BASE, del, get, post } from "./http";

export const uploadApi = {
  preview: (body: UploadRequest) => post<UploadPreview>("/uploads/preview", body),
  saveTest: (body: UploadRequest) => post<SavedTest>("/uploads/tests", body),
  listTests: () => get<UploadedTestRow[]>("/uploads/tests"),
  deleteTest: (assessmentId: string) =>
    del<{ deleted: boolean }>(`/uploads/tests/${assessmentId}`),
  sample: () => post<SavedTest>("/uploads/sample", {}),
  /** A plain link, so the browser downloads the file itself. */
  templateUrl: (name: TemplateName) => `${API_BASE}/uploads/templates/${name}`,
};
