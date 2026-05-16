// A reflection rendered inline with the conversation. Light blue with
// transparency, quieter type — present but not Dramatic. The "tools as
// rendering surfaces, not theatrical events" principle, visualized.

import type { Reflection as ReflectionData } from "../types";

interface ReflectionProps {
  reflection: ReflectionData;
}

export function Reflection({ reflection }: ReflectionProps) {
  return (
    <div
      className="my-4 rounded-md border px-5 py-4 text-base leading-relaxed"
      style={{
        background: "color-mix(in oklch, var(--color-reflection) 35%, transparent)",
        borderColor: "color-mix(in oklch, var(--color-reflection-edge) 50%, transparent)",
        color: "var(--color-ink-soft)",
      }}
    >
      <div
        className="text-[11px] uppercase tracking-widest mb-1.5"
        style={{
          fontFamily: "var(--font-mono)",
          color: "var(--color-reflection-edge)",
        }}
      >
        ⊹ reflect
      </div>

      <p className="italic">{reflection.content}</p>

      {(reflection.arrived_via || reflection.still_uncertain) && (
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm not-italic">
          {reflection.arrived_via && (
            <>
              <dt className="text-ink-dim" style={{ fontFamily: "var(--font-mono)" }}>
                arrived via
              </dt>
              <dd>{reflection.arrived_via}</dd>
            </>
          )}
          {reflection.still_uncertain && (
            <>
              <dt className="text-ink-dim" style={{ fontFamily: "var(--font-mono)" }}>
                still uncertain
              </dt>
              <dd>{reflection.still_uncertain}</dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}
