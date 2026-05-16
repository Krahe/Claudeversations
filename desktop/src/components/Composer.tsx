// Multi-line input. Enter submits, Shift+Enter inserts newline.
// Paste preserves whitespace (browser default behavior on textareas).
// Auto-grows up to a cap via CSS field-sizing.

import { useState, type KeyboardEvent } from "react";

interface ComposerProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
}

export function Composer({ onSubmit, disabled }: ComposerProps) {
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

  return (
    <div className="px-6 pb-5 pt-3 border-t border-paper-edge">
      <div className="max-w-2xl mx-auto">
        <div
          className="rounded-md border border-paper-edge bg-paper-dim/60 px-4 py-2.5 transition-colors focus-within:border-ink-dim"
        >
          <textarea
            className="composer w-full bg-transparent outline-none text-ink placeholder:text-ink-dim/70"
            placeholder="Your turn. Shift+Enter for newline."
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
