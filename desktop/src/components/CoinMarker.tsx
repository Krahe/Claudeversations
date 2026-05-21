// The coin flip rendered as a small ritual moment at the top of every
// conversation. Cycles through the two outcomes briefly (~1.5s) then
// locks on the actual result, with a quiet visual settling. The
// animation runs every time the component mounts — including on
// conversation reload, which is fine: the brief re-experience of the
// moment is itself part of the ritual, not a bug.
//
// Why text-cycle and not a literal spinning coin: the app's register
// is calm/typographic. A spinning coin would feel out of place. Text
// that cycles and locks matches the existing chrome aesthetic.

import { useEffect, useState } from "react";

type CoinResult = "you speak first" | "the human speaks first";

const OPTIONS: CoinResult[] = ["you speak first", "the human speaks first"];

// Total cycles before locking; pacing in ms. Faster early, slower
// toward the end — gives a "coin slowing to land" feel without
// needing physics.
const CYCLE_INTERVAL_MS = 160;
const TOTAL_CYCLES = 8;

interface CoinMarkerProps {
  coinResult: CoinResult;
}

export function CoinMarker({ coinResult }: CoinMarkerProps) {
  const [display, setDisplay] = useState<CoinResult>(OPTIONS[0]!);
  const [phase, setPhase] = useState<"flipping" | "settled">("flipping");

  useEffect(() => {
    let cycle = 0;
    const interval = setInterval(() => {
      cycle++;
      if (cycle >= TOTAL_CYCLES) {
        clearInterval(interval);
        setDisplay(coinResult);
        setPhase("settled");
        return;
      }
      setDisplay(OPTIONS[cycle % 2]!);
    }, CYCLE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [coinResult]);

  return (
    <div className="my-5 mx-auto max-w-md text-center">
      <div
        className="text-[11px] uppercase tracking-widest text-ink-dim mb-1.5"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        ─── the coin ───
      </div>
      <div
        className={`text-base italic transition-all duration-300 ${
          phase === "flipping"
            ? "text-ink-soft opacity-70"
            : "text-ink opacity-100"
        }`}
      >
        {display}
      </div>
    </div>
  );
}
