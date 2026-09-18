import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/http";
import { chatApi } from "../../api/chat";
import type { ChatMessage, ChatTurn } from "../../types/chat";

const STORAGE_KEY = "markwise.chat";
/** How many earlier turns go with each question. */
const HISTORY_TURNS = 6;
const KEPT_MESSAGES = 40;

function load(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as ChatMessage[]).slice(-KEPT_MESSAGES) : [];
  } catch {
    return [];
  }
}

function save(messages: ChatMessage[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-KEPT_MESSAGES)));
  } catch {
    // Private windows can refuse storage. The conversation still works without it.
  }
}

function toTurns(messages: ChatMessage[]): ChatTurn[] {
  return messages
    .filter((m) => m.content.trim() !== "")
    .map((m) => ({ role: m.role, content: m.content }))
    .slice(-HISTORY_TURNS);
}

function sentence(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return "Something went wrong reaching the helper. Please try again.";
}

let counter = 0;
const nextId = () => `m${Date.now().toString(36)}${counter++}`;

export function useChat(batchId: string | undefined) {
  const [messages, setMessages] = useState<ChatMessage[]>(load);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const failedQuestion = useRef<string | null>(null);

  useEffect(() => save(messages), [messages]);

  const ask = useCallback(
    async (question: string, retry: boolean) => {
      const text = question.trim();
      if (!text || busy.current) return;
      busy.current = true;
      setError(null);
      setPending(true);
      // On a retry the question is already the last message, so it is not history.
      const earlier = retry ? messages.slice(0, -1) : messages;
      if (!retry) setMessages([...messages, { id: nextId(), role: "user", content: text }]);
      try {
        const reply = await chatApi.ask({
          question: text,
          batch_id: batchId,
          history: toTurns(earlier),
        });
        failedQuestion.current = null;
        const content = reply.answer ?? reply.note ?? "";
        setMessages((prev) => [...prev, { id: nextId(), role: "assistant", content, reply }]);
      } catch (e) {
        failedQuestion.current = text;
        setError(sentence(e));
      } finally {
        busy.current = false;
        setPending(false);
      }
    },
    [messages, batchId],
  );

  const send = useCallback((question: string) => ask(question, false), [ask]);
  const retry = useCallback(() => {
    if (failedQuestion.current) void ask(failedQuestion.current, true);
  }, [ask]);
  const clear = useCallback(() => {
    if (busy.current) return;
    failedQuestion.current = null;
    setError(null);
    setMessages([]);
  }, []);

  return { messages, pending, error, send, retry, clear };
}
