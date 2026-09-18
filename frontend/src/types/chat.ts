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

/** One line of the conversation as the panel keeps it. The reply is kept whole so sources and notes can be shown. */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  reply?: ChatReply;
}
