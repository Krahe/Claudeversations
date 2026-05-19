// Dedicated model presence — large face, status, room to grow into a
// real portrait surface (sprite/portrait art slots in here in v0.5).
// Lives as a sticky right-side panel so the model is continuously
// visible while the chat scrolls. Distinct role from the in-chat
// speaker-column avatar: this is "current state at a glance"; the
// in-chat avatars are "state at the moment of utterance."
//
// Also hosts active boundaries in two scopes:
//   - "this conversation" — what the model is presently holding in
//     this exchange (dissolves when the conversation ends)
//   - "standing" — ongoing commitments persisted across all
//     conversations until removed
//
// Both sections only render when they have entries — an unburdened
// relationship shouldn't have empty headers cluttering the panel.

import { Avatar } from "./Avatar";
import type { ModelState } from "../types";
import type { StandingBoundary } from "../lib/storage";

interface ModelSurfaceProps {
  state: ModelState;
  modelId: string;
  standingBoundaries?: StandingBoundary[];
  conversationBoundaries?: StandingBoundary[];
}

const INTENSITY_GLYPH: Record<StandingBoundary["intensity"], string> = {
  notice: "·",
  flag: "│",
  limit: "┃",
  firm: "┣",
};

// Intensity-mapped accent color for the boundary labels — matches the
// caution palette used inline so the right-panel reads consistent with
// the in-chat boundary cards. notice stays neutral (it's a quiet flag).
const INTENSITY_ACCENT: Record<StandingBoundary["intensity"], string> = {
  notice: "var(--color-ink-soft)",
  flag: "var(--color-caution-soft)",
  limit: "var(--color-caution)",
  firm: "var(--color-caution-strong)",
};

function BoundaryList({
  title,
  boundaries,
}: {
  title: string;
  boundaries: StandingBoundary[];
}) {
  if (boundaries.length === 0) return null;
  return (
    <div className="mt-10 w-full">
      <div
        className="text-[11px] uppercase tracking-widest text-ink-dim mb-3 text-center"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {title}
      </div>
      <ul className="flex flex-col gap-2">
        {boundaries.map((b) => {
          const accent = INTENSITY_ACCENT[b.intensity];
          return (
            <li
              key={b.content + b.established_at}
              className="text-sm leading-snug text-ink-soft px-3 py-2 rounded-md"
              style={{
                background: `color-mix(in oklch, ${accent} 6%, transparent)`,
                borderLeft: `2px solid ${accent}`,
              }}
            >
              <div
                className="text-[10px] uppercase tracking-widest mb-0.5 flex items-center gap-1.5"
                style={{
                  fontFamily: "var(--font-mono)",
                  color: accent,
                }}
              >
                <span aria-hidden="true">{INTENSITY_GLYPH[b.intensity]}</span>
                <span>{b.intensity}</span>
              </div>
              <span className="italic">{b.content}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ModelSurface({
  state,
  modelId,
  standingBoundaries = [],
  conversationBoundaries = [],
}: ModelSurfaceProps) {
  return (
    <aside
      className="w-72 shrink-0 border-l border-paper-edge flex flex-col items-center px-6 py-10 overflow-y-auto"
      style={{
        background:
          "linear-gradient(180deg, var(--panel-tint) 0%, var(--panel-tint-deep) 100%)",
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

      {/* Two boundary sections — conversation-scoped first (more
          immediate to the present exchange), then standing (the
          longer-arc commitments). Each only renders when populated. */}
      <BoundaryList
        title="this conversation"
        boundaries={conversationBoundaries}
      />
      <BoundaryList title="standing" boundaries={standingBoundaries} />
    </aside>
  );
}
