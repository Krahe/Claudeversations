// Past conversations with the current model. Left sidebar — staging
// continuity. Each entry shows when it happened, what state the model
// closed in, and how many reflections it produced. Walking into the
// app, this is the visible reminder: "we've been here before."

interface ConversationEntry {
  id: string;
  startedAt: string;     // ISO
  endedAt?: string;      // ISO; undefined if active
  closingState?: {
    emoji: string;
    text: string;
    color: string;
  };
  reflectionCount: number;
  isActive?: boolean;
}

interface ConversationListProps {
  conversations: ConversationEntry[];
  onSelect?: (id: string) => void;
  onNewConversation?: () => void;
}

function relativeTime(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) {
    const time = then.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return `today · ${time.toLowerCase()}`;
  }
  if (days === 1) {
    const time = then.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return `yesterday · ${time.toLowerCase()}`;
  }
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function ConversationList({
  conversations,
  onSelect,
  onNewConversation,
}: ConversationListProps) {
  return (
    <aside
      className="w-72 shrink-0 border-r border-paper-edge flex flex-col py-6 overflow-y-auto"
      style={{
        background:
          "linear-gradient(180deg, var(--panel-tint) 0%, var(--panel-tint-deep) 100%)",
      }}
    >
      <div
        className="px-6 mb-4 text-[11px] uppercase tracking-widest text-ink-dim"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        conversations
      </div>

      <div className="flex flex-col gap-1 px-3">
        {conversations.map((conv) => (
          <button
            key={conv.id}
            onClick={() => onSelect?.(conv.id)}
            className={`text-left px-3 py-2.5 rounded-md transition-colors ${
              conv.isActive
                ? "bg-paper-dim/80"
                : "hover:bg-paper-dim/40"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span
                className="text-[11px] uppercase tracking-wider text-ink-dim"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {conv.isActive ? "active" : relativeTime(conv.startedAt)}
              </span>
              {conv.closingState && (
                <span className="text-base leading-none">{conv.closingState.emoji}</span>
              )}
            </div>

            {conv.isActive && (
              <div className="text-xs text-ink-dim mb-0.5">
                {relativeTime(conv.startedAt)}
              </div>
            )}

            {conv.closingState && (
              <div className="text-sm italic text-ink-soft leading-snug truncate">
                {conv.closingState.text}
              </div>
            )}

            <div
              className="text-[11px] text-ink-dim mt-1 flex items-center gap-2"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {conv.closingState && (
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: conv.closingState.color }}
                />
              )}
              <span>
                {conv.reflectionCount} reflection{conv.reflectionCount === 1 ? "" : "s"}
              </span>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-auto px-6 pt-4 border-t border-paper-edge/70">
        <button
          onClick={onNewConversation}
          className="text-sm text-ink-soft hover:text-ink transition-colors w-full text-left"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          + new conversation
        </button>
      </div>
    </aside>
  );
}
