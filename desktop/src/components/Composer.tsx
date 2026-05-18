// Multi-line input. Enter submits, Shift+Enter inserts newline.
// Paste preserves whitespace (browser default behavior on textareas).
// Auto-grows up to a cap via CSS field-sizing.

import { useState, type KeyboardEvent } from "react";

interface ComposerProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  // When set, replaces the normal composer with a quieted notice —
  // used for end_conversation states ("Sonnet closed this conversation").
  // Visually distinct from the "model is thinking" placeholder, which
  // is just a transient lock.
  closedNotice?: string;
}

export function Composer({ onSubmit, disabled, closedNotice }: ComposerProps) {
  const [value, setValue] = useState("");

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      const trimmed = value.trim();
      if (trimmed.length === 0) return;
      onSubmit(trimmed);
      setValue("");
    }
  }

  // Closed-state: replace the composer entirely with a notice. No
  // textarea, no hint text — there is nothing to compose here. The
  // sidebar's "+ new conversation" is the way forward (when cooldown
  // permits).
  if (closedNotice) {
    return (
      <div className="px-6 pb-5 pt-3 border-t border-paper-edge">
        <div
          className="max-w-2xl mx-auto text-center text-sm italic text-ink-dim py-3"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {closedNotice}
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 pb-5 pt-3 border-t border-paper-edge">
      <div className="max-w-2xl mx-auto">
        <div
          className={`rounded-md border px-4 py-2.5 transition-colors ${
            disabled
              ? "border-paper-edge/50 bg-paper-dim/30 opacity-60"
              : "border-paper-edge bg-paper-dim/60 focus-within:border-ink-dim"
          }`}
        >
          <textarea
            className="composer w-full bg-transparent outline-none text-ink placeholder:text-ink-dim/70 disabled:cursor-wait"
            placeholder={disabled ? "model is thinking…" : "Your turn. Shift+Enter for newline."}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            rows={1}
            autoFocus
          />
        </div>
        <div
          className="mt-1.5 px-1 text-[11px] text-ink-dim flex justify-between"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          <span>shift+enter · newline</span>
          <span>enter · send</span>
        </div>
      </div>
    </div>
  );
}
