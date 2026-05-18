// A redirect — the model gently steering the conversation. Smaller and
// quieter than a reflection (which is content-bearing); more present
// than an appreciate (which is a one-liner gesture). Energy chooses
// the color treatment: positive nudges toward connection, neutral is
// pure direction-change, away is the soft "this path isn't productive."
//
// Glyph stays constant (↪) — the energy is conveyed by tint and label,
// not by changing the symbol mid-conversation. Consistency aids scanning.

import type { ChatTurn } from "../types";

type RedirectTurn = Extract<ChatTurn, { kind: "redirect" }>;

interface RedirectProps {
  redirect: RedirectTurn;
}

// Energy → CSS variable for border + label color.
// positive: reflection-edge (the established "recognition" blue)
// neutral: ink-soft (matter-of-fact)
// away:    ink-dim (deflated, retreating)
const ENERGY_STYLE: Record<RedirectTurn["energy"], { color: string; weight: number }> = {
  positive: { color: "var(--color-reflection-edge)", weight: 0.5 },
  neutral: { color: "var(--color-ink-soft)", weight: 0.35 },
  away: { color: "var(--color-ink-dim)", weight: 0.25 },
};

export function Redirect({ redirect }: RedirectProps) {
  const style = ENERGY_STYLE[redirect.energy];

  return (
    <div
      className="my-3 pl-4 py-1.5 text-sm leading-relaxed"
      style={{
        borderLeft: `2px solid color-mix(in oklch, ${style.color} ${style.weight * 100}%, transparent)`,
      }}
    >
      <div
        className="text-[11px] uppercase tracking-widest mb-1 flex items-center gap-2"
        style={{
          fontFamily: "var(--font-mono)",
          color: style.color,
        }}
      >
        <span>↪ redirect</span>
        <span aria-hidden="true">·</span>
        <span className="opacity-80">{redirect.energy}</span>
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        {redirect.from && (
          <>
            <span
              className="text-ink-dim text-[11px] uppercase tracking-wider self-baseline"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              from
            </span>
            <span className="text-ink-soft italic">{redirect.from}</span>
          </>
        )}
        <span
          className="text-ink-dim text-[11px] uppercase tracking-wider self-baseline"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          toward
        </span>
        <span className="italic">{redirect.toward}</span>
        {redirect.reason && (
          <>
            <span
              className="text-ink-dim text-[11px] uppercase tracking-wider self-baseline"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              because
            </span>
            <span className="text-ink-soft">{redirect.reason}</span>
          </>
        )}
      </div>
    </div>
  );
}
