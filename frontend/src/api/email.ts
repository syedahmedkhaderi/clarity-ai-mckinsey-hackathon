import type {
  EmailDraft,
  EmailStatus,
  SendEmailRequest,
  SendResult,
  SentEmail,
  Student,
} from "../types/email";
import { get, post, put } from "./http";

export const emailApi = {
  status: () => get<EmailStatus>("/email/status"),
  students: (classId: string) => get<Student[]>(`/students?class_id=${encodeURIComponent(classId)}`),
  updateStudent: (learnerId: string, email: string) =>
    put<Student>(`/students/${learnerId}`, { email }),
  draft: (batch_id: string, learner_id: string) =>
    post<EmailDraft>("/email/draft", { batch_id, learner_id }),
  send: (body: SendEmailRequest) => post<SendResult>("/email/send", body),
  testCopy: (subject: string, body: string) =>
    post<SendResult>("/email/test-copy", { subject, body }),
  sent: (batchId: string) => get<SentEmail[]>(`/email/sent?batch_id=${encodeURIComponent(batchId)}`),
};
