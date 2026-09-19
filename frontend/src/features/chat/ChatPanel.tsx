import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Mascot } from "./Mascot";
import type { ChatMessage, ChatSource } from "../../types/chat";

export const DRAFT_LINE = "These marks are drafts.";
const EMPTY_SENTENCE =
  "Ask about a student, a test or your class. I read your uploaded files and the analysis.";
const MAX_QUESTION = 1000;
const MAX_INPUT_PX = 96;

/** Models sometimes bold with asterisks. The panel shows plain text, so drop the markers. */
const plain = (s: string) => s.replace(/\*\*/g, "");

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-agent";

interface PanelProps {
  messages: ChatMessage[];
  pending: boolean;
  error: string | null;
  suggestions: string[];
  onSend: (question: string) => void;
  onRetry: () => void;
  onClear: () => void;
  onClose: () => void;
  /** True when the deterministic rules are doing the work and no model is involved. */
  offline: boolean;
}

export function ChatPanel(p: PanelProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [p.messages.length, p.pending, p.error]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") p.onClose();
  };

  return (
    <div
      id="chat-panel"
      role="dialog"
      aria-label="Pencil helper"
      onKeyDown={onKey}
      className="fixed bottom-[84px] left-4 right-4 z-40 flex h-[70vh] max-h-[560px] flex-col rounded-md border border-line-strong bg-surface sm:left-auto sm:w-[380px]"
    >
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Mascot size={26} animated={false} />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-ink">Pencil helper</h2>
          <p className="text-2xs text-ink-muted">
            {p.offline ? "Using the built-in rules only, no AI." : "AI is helping with the answers."}
          </p>
        </div>
        {p.messages.length > 0 && (
          <button
            type="button"
            className={`btn btn-xs ${focusRing}`}
            onClick={p.onClear}
            disabled={p.pending}
          >
            Start again
          </button>
        )}
        <button type="button" className={`btn btn-xs ${focusRing}`} onClick={p.onClose}>
          Close
        </button>
      </header>

      <div
        ref={listRef}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden px-3 py-3"
      >
        {p.messages.length === 0 ? (
          <Empty suggestions={p.suggestions} onPick={p.onSend} disabled={p.pending} />
        ) : (
          p.messages.map((m) => <Message key={m.id} message={m} />)
        )}
        {p.pending && <Typing />}
        {p.error && (
          <div role="alert" className="rounded border border-line-strong bg-surface-sunken px-3 py-2 text-sm text-ink">
            <p className="[overflow-wrap:anywhere]">{p.error}</p>
            <button type="button" className={`btn btn-xs mt-2 ${focusRing}`} onClick={p.onRetry}>
              Try again
            </button>
          </div>
        )}
      </div>

      <Composer inputRef={inputRef} disabled={p.pending} onSend={p.onSend} />
    </div>
  );
}

function Empty({
  suggestions,
  onPick,
  disabled,
}: {
  suggestions: string[];
  onPick: (q: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted">{EMPTY_SENTENCE}</p>
      {suggestions.length > 0 && (
        <ul className="flex flex-col items-start gap-1.5" aria-label="Questions you could ask">
          {suggestions.map((s) => (
            <li key={s} className="max-w-full">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(s)}
                className={`max-w-full rounded border border-line-strong bg-surface px-2 py-1 text-left text-xs text-ink [overflow-wrap:anywhere] hover:bg-surface-sunken disabled:opacity-40 ${focusRing}`}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Typing() {
  return (
    <div role="status" className="flex items-center gap-1 self-start px-1 py-1">
      <span className="sr-only">The helper is writing an answer.</span>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-ink-faint motion-safe:animate-pulse"
          style={{ animationDelay: `${i * 180}ms` }}
        />
      ))}
    </div>
  );
}

function Message({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="max-w-[85%] self-end rounded-md bg-agent px-3 py-2 text-sm text-white">
        <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.content}</p>
      </div>
    );
  }
  const reply = message.reply;
  const passages = reply?.mode === "passages";
  const sources = reply?.sources ?? [];
  const text = plain(message.content) || "I could not find that in your files.";
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-2 self-start">
      <div className="rounded-md border border-line bg-surface-sunken px-3 py-2 text-sm text-ink">
        <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{text}</p>
      </div>
      {passages && sources.length > 0 && <Passages sources={sources} />}
      {!passages && sources.length > 0 && <SourceChips sources={sources} />}
      {reply?.marks_are_draft && <p className="text-xs text-ink-muted">{DRAFT_LINE}</p>}
    </div>
  );
}

/** Answer mode: folded to one line until asked for, then titles as chips, one snippet open at a time. */
function SourceChips({ sources }: { sources: ChatSource[] }) {
  const [listed, setListed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const shown = sources.find((s) => s.id === open);
  const count = `${sources.length} ${sources.length === 1 ? "source" : "sources"}`;
  return (
    <div className="min-w-0">
      <button
        type="button"
        aria-expanded={listed}
        onClick={() => setListed(!listed)}
        className={`inline-flex items-center gap-1 rounded text-xs text-ink-muted hover:text-ink ${focusRing}`}
      >
        <svg
          viewBox="0 0 12 12"
          aria-hidden="true"
          className={`h-3 w-3 transition-transform ${listed ? "rotate-90" : ""}`}
        >
          <path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        {listed ? "Hide sources" : `Based on ${count}`}
      </button>
      {listed && (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {sources.map((s) => (
            <li key={s.id} className="max-w-full">
              <button
                type="button"
                aria-expanded={open === s.id}
                onClick={() => setOpen(open === s.id ? null : s.id)}
                className={`max-w-full truncate rounded border px-1.5 py-0.5 text-xs ${focusRing} ${
                  open === s.id
                    ? "border-agent-line bg-agent-soft text-agent"
                    : "border-line-strong bg-surface text-ink-muted hover:bg-surface-sunken"
                }`}
              >
                {s.title}
              </button>
            </li>
          ))}
        </ul>
      )}
      {listed && shown && (
        <p className="mt-1.5 whitespace-pre-wrap rounded border border-line bg-surface px-2 py-1.5 text-xs text-ink-muted [overflow-wrap:anywhere]">
          {shown.snippet}
        </p>
      )}
    </div>
  );
}

/** Passages mode: no answer was written, so the notes themselves are the reply. */
function Passages({ sources }: { sources: ChatSource[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  return (
    <ul className="flex flex-col divide-y divide-line rounded border border-line bg-surface">
      {sources.map((s) => {
        const expanded = open.has(s.id);
        return (
          <li key={s.id} className="min-w-0">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => toggle(s.id)}
              className={`block w-full px-2 py-1.5 text-left ${focusRing}`}
            >
              <span className="block text-xs font-medium text-ink [overflow-wrap:anywhere]">
                {s.title}
              </span>
              <span
                className={`mt-0.5 whitespace-pre-wrap text-xs text-ink-muted [overflow-wrap:anywhere] ${
                  expanded ? "block" : "line-clamp-2"
                }`}
              >
                {s.snippet}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Composer({
  inputRef,
  disabled,
  onSend,
}: {
  inputRef: React.RefObject<HTMLTextAreaElement>;
  disabled: boolean;
  onSend: (q: string) => void;
}) {
  const [value, setValue] = useState("");

  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_PX)}px`;
  };

  const submit = () => {
    const q = value.trim();
    if (!q || disabled) return;
    onSend(q);
    setValue("");
    if (inputRef.current) inputRef.current.style.height = "auto";
  };

  return (
    <form
      className="flex items-end gap-2 border-t border-line px-3 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor="chat-input" className="sr-only">
        Your question
      </label>
      <textarea
        id="chat-input"
        ref={inputRef}
        rows={1}
        value={value}
        maxLength={MAX_QUESTION}
        placeholder="Type your question"
        onChange={(e) => {
          setValue(e.target.value);
          grow(e.target);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        className={`min-h-[34px] flex-1 resize-none rounded border border-line-strong bg-surface px-2 py-1.5 text-sm text-ink placeholder:text-ink-faint ${focusRing}`}
      />
      <button
        type="submit"
        className={`btn btn-primary ${focusRing}`}
        disabled={disabled || value.trim() === ""}
      >
        Send
      </button>
    </form>
  );
}
