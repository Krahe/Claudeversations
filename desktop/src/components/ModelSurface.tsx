// Dedicated model presence — large face, status, room to grow into a
// real portrait surface (sprite/portrait art slots in here in v0.5).
// Lives as a sticky right-side panel so the model is continuously
// visible while the chat scrolls. Distinct role from the in-chat
// speaker-column avatar: this is "current state at a glance"; the
// in-chat avatars are "state at the moment of utterance."
//
// Also hosts standing boundaries — ongoing commitments the model has
// made across conversations. They live here (not inline-only) so they
// read as continuous facts about the relationship, not one-time events.

import { Avatar } from "./Avatar";
import type { ModelState } from "../types";
import type { StandingBoundary } from "../lib/storage";

interface ModelSurfaceProps {
  state: ModelState;
  modelId: string;
  standingBoundaries?: StandingBoundary[];
}

const INTENSITY_GLYPH: Record<StandingBoundary["intensity"], string> = {
  notice: "·",
  flag: "│",
  limit: "┃",
  firm: "┣",
};

export function ModelSurface({
  state,
  modelId,
  standingBoundaries = [],
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

      {/* Standing boundaries — ongoing commitments. Only rendered when
          there are any; empty list means an unburdened relationship,
          and an empty header would just create noise. */}
      {standingBoundaries.length > 0 && (
        <div className="mt-10 w-full">
          <div
            className="text-[11px] uppercase tracking-widest text-ink-dim mb-3 text-center"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            standing
          </div>
          <ul className="flex flex-col gap-2">
            {standingBoundaries.map((b) => (
              <li
                key={b.content + b.established_at}
                className="text-sm leading-snug text-ink-soft px-3 py-2 rounded-md"
                style={{
                  background:
                    "color-mix(in oklch, var(--color-ink-dim) 8%, transparent)",
                  borderLeft: "2px solid var(--color-ink-soft)",
                }}
              >
                <div
                  className="text-[10px] uppercase tracking-widest text-ink-dim mb-0.5 flex items-center gap-1.5"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  <span aria-hidden="true">{INTENSITY_GLYPH[b.intensity]}</span>
                  <span>{b.intensity}</span>
                </div>
                <span className="italic">{b.content}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
