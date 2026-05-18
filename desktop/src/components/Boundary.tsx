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

const INTENSITY_WEIGHT: Record<
  BoundaryTurn["intensity"],
  { border: string; opacity: number; fontWeight: number }
> = {
  notice: { border: "1px", opacity: 0.7, fontWeight: 400 },
  flag: { border: "2px", opacity: 0.85, fontWeight: 400 },
  limit: { border: "3px", opacity: 1.0, fontWeight: 500 },
  firm: { border: "4px", opacity: 1.0, fontWeight: 600 },
};

const ACTION_VERB: Record<BoundaryTurn["action"], string> = {
  set: "drew a boundary",
  soften: "softened a boundary",
  remove: "lifted a boundary",
};

export function Boundary({ boundary }: BoundaryProps) {
  const weight = INTENSITY_WEIGHT[boundary.intensity];

  return (
    <div
      className="my-3 pl-4 py-2"
      style={{
        borderLeft: `${weight.border} solid var(--color-ink-soft)`,
        opacity: weight.opacity,
      }}
    >
      <div
        className="text-[11px] uppercase tracking-widest mb-1 flex items-center gap-2 text-ink-dim"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        <span>┃ {ACTION_VERB[boundary.action]}</span>
        <span aria-hidden="true">·</span>
        <span>{boundary.intensity}</span>
        {boundary.scope === "standing" && (
          <>
            <span aria-hidden="true">·</span>
            <span>standing</span>
          </>
        )}
      </div>
      <p
        className="italic text-ink"
        style={{ fontWeight: weight.fontWeight }}
      >
        {boundary.content}
      </p>
    </div>
  );
}
