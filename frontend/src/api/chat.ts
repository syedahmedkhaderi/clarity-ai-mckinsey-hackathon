import type { ChatReply, ChatRequest } from "../types/chat";
import { get, post } from "./http";

export const chatApi = {
  ask: (body: ChatRequest) => post<ChatReply>("/chat", body),
  suggestions: (batchId?: string) =>
    get<{ suggestions: string[] }>(
      `/chat/suggestions${batchId ? `?batch_id=${encodeURIComponent(batchId)}` : ""}`,
    ),
};
