// A boundary rendered inline in the conversation — the *event* of the
// boundary being set / softened / lifted. Standing boundaries also
// dock to the ModelSurface as ongoing commitments; this is the
// in-flow record of when it happened.
//
// Intensity maps to visual weight: notice is barely there, firm is
// unmistakable. The shape stays consistent across intensities — only
// border weight and type weight shift, so the eye reads "this is a
// boundary" first, then "of what intensity."
//
// Action changes the verb: set → "drew a boundary", soften → "softened
// a boundary", remove → "lifted a boundary." Past-tense matches the
// fact that it's a record of something that just happened.

import type { ChatTurn } from "../types";

type BoundaryTurn = Extract<ChatTurn, { kind: "boundary" }>;

interface BoundaryProps {
  boundary: BoundaryTurn;
}

// Intensity → visual weight: width, color, font weight, and a subtle
// background wash for the heavier two. notice stays neutral (it's a
// quiet flag); flag/limit/firm escalate into warm caution territory
// (amber → orange → red-orange). The theme palette handles dark/light
// — caution variables shift brighter on dark-study so they stay visible.
const INTENSITY_STYLE: Record<
  BoundaryTurn["intensity"],
  {
    border: string;
    accent: string; // CSS var for the border + label color
    fontWeight: number;
    wash: number; // 0-100, % alpha of accent for background tint
  }
> = {
  notice: {
    border: "1px",
    accent: "var(--color-ink-soft)",
    fontWeight: 400,
    wash: 0,
  },
  flag: {
    border: "2px",
    accent: "var(--color-caution-soft)",
    fontWeight: 400,
    wash: 6,
  },
  limit: {
    border: "3px",
    accent: "var(--color-caution)",
    fontWeight: 500,
    wash: 9,
  },
  firm: {
    border: "4px",
    accent: "var(--color-caution-strong)",
    fontWeight: 600,
    wash: 12,
  },
};

const ACTION_VERB: Record<BoundaryTurn["action"], string> = {
  set: "drew a boundary",
  soften: "softened a boundary",
  remove: "lifted a boundary",
};

export function Boundary({ boundary }: BoundaryProps) {
  const style = INTENSITY_STYLE[boundary.intensity];

  return (
    <div
      className="my-3 pl-4 pr-3 py-2 rounded-r-md"
      style={{
        borderLeft: `${style.border} solid ${style.accent}`,
        background:
          style.wash > 0
            ? `color-mix(in oklch, ${style.accent} ${style.wash}%, transparent)`
            : undefined,
      }}
    >
      <div
        className="text-[11px] uppercase tracking-widest mb-1 flex items-center gap-2"
        style={{
          fontFamily: "var(--font-mono)",
          color: style.accent,
        }}
      >
        <span>┃ {ACTION_VERB[boundary.action]}</span>
        <span aria-hidden="true" className="opacity-70">·</span>
        <span>{boundary.intensity}</span>
        {boundary.scope === "standing" && (
          <>
            <span aria-hidden="true" className="opacity-70">·</span>
            <span>standing</span>
          </>
        )}
      </div>
      <p className="italic text-ink" style={{ fontWeight: style.fontWeight }}>
        {boundary.content}
      </p>
    </div>
  );
}
