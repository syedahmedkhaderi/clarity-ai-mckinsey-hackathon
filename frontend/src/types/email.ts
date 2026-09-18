export interface EmailStatus {
  gmail_configured: boolean;
  sender: string | null;
  delivery: "gmail" | "save_only";
}

export interface Student {
  learner_id: string;
  class_id: string;
  name: string;
  email: string;
  origin: string;
}

export interface EmailObservation {
  test: string;
  question_number: number;
  area: string;
  pattern: string;
}

export interface EmailDraft {
  learner_id: string;
  name: string;
  to: string;
  subject: string;
  body: string;
  observations: EmailObservation[];
}

export interface SendEmailRequest {
  batch_id: string;
  learner_id: string;
  to?: string;
  subject: string;
  body: string;
  resend?: boolean;
}

export interface SendResult {
  email_id: number;
  status: "delivered" | "saved" | "failed";
  reason: string;
  message: string;
}

export interface SentEmail {
  email_id: number;
  batch_id: string;
  learner_id: string;
  name: string;
  kind: "student" | "test_copy";
  to_address: string;
  subject: string;
  body: string;
  status: "delivered" | "saved" | "failed";
  reason: string;
  created_at: string;
}
