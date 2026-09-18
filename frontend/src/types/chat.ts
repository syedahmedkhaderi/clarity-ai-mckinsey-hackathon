export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  question: string;
  batch_id?: string;
  history?: ChatTurn[];
}

export interface ChatSource {
  id: string;
  title: string;
  kind: string;
  snippet: string;
}

export interface ChatReply {
  mode: "ai" | "passages";
  answer: string | null;
  note: string | null;
  sources: ChatSource[];
  marks_are_draft: boolean;
}
