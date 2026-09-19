import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { chatApi } from "../../api/chat";
import { useSession } from "../../hooks/useSession";
import { ChatPanel } from "./ChatPanel";
import { Mascot } from "./Mascot";
import { useChat } from "./useChat";

const TAG_KEY = "markwise.chat.tagSeen";
const TAG_VISIBLE_MS = 15000;

function tagAlreadySeen(): boolean {
  try {
    return localStorage.getItem(TAG_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberTagSeen(): void {
  try {
    localStorage.setItem(TAG_KEY, "1");
  } catch {
    // Without storage the tag simply shows again next visit.
  }
}

/** Mounted once in App, outside the shell, so it sits bottom right on every page. */
export function ChatDock() {
  const { batch, health } = useSession();
  const batchId = batch?.batch_id;
  const offline = (health?.provider ?? "offline") === "offline";
  const [open, setOpen] = useState(false);
  const [showTag, setShowTag] = useState(() => !tagAlreadySeen());
  const chat = useChat(batchId);

  const suggestions = useQuery({
    queryKey: ["chat-suggestions", batchId ?? null],
    queryFn: () => chatApi.suggestions(batchId),
    enabled: open,
    staleTime: 60_000,
    retry: false,
  });

  const dismissTag = () => {
    setShowTag(false);
    rememberTagSeen();
  };

  useEffect(() => {
    if (!showTag) return;
    const id = setTimeout(dismissTag, TAG_VISIBLE_MS);
    return () => clearTimeout(id);
  }, [showTag]);

  const toggle = () => {
    if (showTag) dismissTag();
    setOpen((o) => !o);
  };

  return (
    <>
      {open && (
        <ChatPanel
          messages={chat.messages}
          pending={chat.pending}
          error={chat.error}
          suggestions={suggestions.data?.suggestions ?? []}
          onSend={(q) => void chat.send(q)}
          onRetry={chat.retry}
          onClear={chat.clear}
          onClose={() => setOpen(false)}
          offline={offline}
        />
      )}
      <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2">
        {showTag && !open && (
          <span className="rounded border border-line-strong bg-surface px-2 py-1 text-xs text-ink">
            Ask me
          </span>
        )}
        <button
          type="button"
          aria-label="Ask the helper"
          aria-expanded={open}
          aria-controls="chat-panel"
          onClick={toggle}
          className="grid h-12 w-12 place-items-center rounded-full border border-line-strong bg-surface hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-agent md:h-14 md:w-14"
        >
          <Mascot size={44} />
        </button>
      </div>
    </>
  );
}
