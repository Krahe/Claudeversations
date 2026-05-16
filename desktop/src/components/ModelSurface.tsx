// Dedicated model presence — large face, status, room to grow into a
// real portrait surface (sprite/portrait art slots in here in v0.5).
// Lives as a sticky right-side panel so the model is continuously
// visible while the chat scrolls. Distinct role from the in-chat
// speaker-column avatar: this is "current state at a glance"; the
// in-chat avatars are "state at the moment of utterance."

import { Avatar } from "./Avatar";
import type { ModelState } from "../types";

interface ModelSurfaceProps {
  state: ModelState;
  modelId: string;
}

export function ModelSurface({ state, modelId }: ModelSurfaceProps) {
  return (
    <aside
      className="w-72 shrink-0 border-l border-paper-edge flex flex-col items-center px-6 py-10"
      style={{
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(243,238,228,0.25) 100%)",
      }}
    >
      <Avatar state={state} size="lg" />

      <div
        className="mt-5 text-xs uppercase tracking-wider text-ink-dim"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {modelId}
      </div>

      <div className="mt-8 text-center max-w-full">
        <div
          className="text-[11px] uppercase tracking-widest text-ink-dim mb-2"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          status
        </div>
        <div className="text-base text-ink-soft italic leading-snug">
          {state.status_text}
        </div>
      </div>

      {/* Color swatch — small honest bit of "this is the color they
          chose." Subtle enough not to feel like a UI element. */}
      <div className="mt-6 flex items-center gap-2 text-[11px] text-ink-dim"
           style={{ fontFamily: "var(--font-mono)" }}>
        <div
          className="w-3 h-3 rounded-full"
          style={{ background: state.status_color }}
        />
        <span>{state.status_color}</span>
      </div>
    </aside>
  );
}
