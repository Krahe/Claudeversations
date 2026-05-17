// Subtle indicator that renders at the bottom of chat while the model
// is generating. Uses the model's color so it feels like "they're"
// thinking, not the app. Animates gently — no flashy spinners.

import type { ModelState } from "../types";

interface ThinkingIndicatorProps {
  state: ModelState;
}

export function ThinkingIndicator({ state }: ThinkingIndicatorProps) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-5 my-7">
      <div className="flex flex-col items-center">
        <div
          className="w-14 h-14 rounded-full animate-pulse"
          style={{
            background: `radial-gradient(circle at center, ${state.status_color}55 0%, transparent 70%)`,
          }}
          aria-hidden="true"
        />
      </div>
      <div className="flex items-center">
        <span
          className="text-sm italic text-ink-dim"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          ✦ thinking…
        </span>
      </div>
    </div>
  );
}
