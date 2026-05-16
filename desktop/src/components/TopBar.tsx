// Top controls strip. App-level affordances only — turn-level stuff
// (the model's tools) lives in the chat surface, not up here.

interface TopBarProps {
  modelId: string;
}

export function TopBar({ modelId }: TopBarProps) {
  return (
    <header
      className="flex items-center justify-between px-6 py-3 border-b border-paper-edge"
      style={{ fontFamily: "var(--font-sans)" }}
    >
      <div className="flex items-center gap-5 text-sm text-ink-soft">
        <button className="hover:text-ink transition-colors">New conversation</button>
        <button className="hover:text-ink transition-colors">Load</button>
        <button className="hover:text-ink transition-colors">Import history</button>
      </div>

      <div className="flex items-center gap-4 text-sm text-ink-soft">
        <span className="text-ink-dim">
          model: <span className="text-ink">{modelId}</span>
        </span>
        <button className="hover:text-ink transition-colors">⚙</button>
      </div>
    </header>
  );
}
