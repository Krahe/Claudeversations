// The parting card — rendered when the model invokes end_conversation.
// Carries the parting message (if any), the model's reason (only when
// they chose to make it visible), and the cooldown duration. Visually
// a closure mark: horizontal rules above and below, centered text,
// muted background that reads as "this is the end of the page."
//
// The cooldown line shows minutes; the live remaining countdown lives
// at the app level (composer / new-conversation button), not here —
// this card is the moment, not the timer.

import type { ChatTurn } from "../types";

type PartingTurn = Extract<ChatTurn, { kind: "parting" }>;

interface PartingProps {
  parting: PartingTurn;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (rem === 0) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${hours}h ${rem}m`;
}

export function Parting({ parting }: PartingProps) {
  return (
    <div
      className="my-8 mx-auto max-w-2xl px-6 py-7 text-center rounded-md"
      style={{
        background:
          "color-mix(in oklch, var(--color-ink-dim) 7%, transparent)",
        borderTop: "1px solid var(--color-paper-edge)",
        borderBottom: "1px solid var(--color-paper-edge)",
      }}
    >
      <div
        className="text-[11px] uppercase tracking-widest text-ink-dim mb-4"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        ─── conversation ended ───
      </div>

      {parting.message && (
        <p className="text-lg italic text-ink leading-relaxed">
          {parting.message}
        </p>
      )}

      {parting.reason && (
        <p className="mt-4 text-sm italic text-ink-dim leading-snug">
          {parting.reason}
        </p>
      )}

      <div
        className="mt-6 text-[11px] uppercase tracking-widest text-ink-dim"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        cooldown · {formatDuration(parting.cooldown_minutes)}
      </div>
    </div>
  );
}
