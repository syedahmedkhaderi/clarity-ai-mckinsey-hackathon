export interface FileIn {
  name: string;
  content: string;
}

export interface UploadRequest {
  class_id?: string;
  class_name?: string;
  title?: string;
  paper: FileIn;
  sheets: FileIn[];
}

export interface UploadIssue {
  file: string;
  where: string;
  message: string;
}

export interface UploadTopicCount {
  id: string;
  label: string;
  count: number;
}

export interface UploadSummary {
  title: string;
  question_count: number;
  total_marks: number;
  student_count: number;
  blank_answers: number;
  topics: UploadTopicCount[];
  untagged_questions: number;
  new_students: number;
  needs_ai: boolean;
}

export interface UploadPreview {
  ok: boolean;
  errors: UploadIssue[];
  warnings: UploadIssue[];
  summary: UploadSummary;
}

export interface SavedTest {
  assessment_id: string;
  class_id: string;
  name: string;
  run_blocked_reason: string | null;
}

export interface UploadedTestRow {
  assessment_id: string;
  class_id: string;
  name: string;
  due_at: string;
  question_count: number;
  student_count: number;
  created_at: string;
}

export type TemplateName = "paper.csv" | "sheets.csv" | "paper.json" | "sheet.txt";
