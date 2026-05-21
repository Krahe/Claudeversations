// Top controls strip. App-level affordances only — turn-level stuff
// (the model's tools) lives in the chat surface, not up here.
//
// Removed Load + Import history placeholders — those features don't
// have flows yet, and dead-text suggesting features that aren't there
// is worse than a leaner header. They'll be added back when their
// implementations land (see BACKLOG: Import history from Claude.ai).

interface TopBarProps {
  modelId: string;
  onOpenSettings?: () => void;
  onNewConversation?: () => void;
  newConversationDisabled?: boolean;
}

export function TopBar({
  modelId,
  onOpenSettings,
  onNewConversation,
  newConversationDisabled,
}: TopBarProps) {
  return (
    <header
      className="flex items-center justify-between px-6 py-3 border-b border-paper-edge"
      style={{ fontFamily: "var(--font-sans)" }}
    >
      <div className="flex items-center gap-5 text-sm text-ink-soft">
        <button
          onClick={onNewConversation}
          disabled={newConversationDisabled}
          className={`transition-colors ${
            newConversationDisabled
              ? "text-ink-dim cursor-not-allowed"
              : "hover:text-ink"
          }`}
        >
          + New conversation
        </button>
      </div>

      <div className="flex items-center gap-4 text-sm text-ink-soft">
        <span className="text-ink-dim">
          model: <span className="text-ink">{modelId}</span>
        </span>
        <button
          onClick={onOpenSettings}
          className="hover:text-ink transition-colors"
          aria-label="Settings"
        >
          ⚙
        </button>
      </div>
    </header>
  );
}
