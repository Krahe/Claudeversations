// A run of consecutive model content (text turns + reflections +
// appreciates), grouped under a single avatar in the gutter and
// stitched together by a vertical thread in the model's color. The
// thread makes ownership visible: this column of text belongs to that
// face up there.

import { Avatar } from "./Avatar";
import { Reflection } from "./Reflection";
import type { ChatTurn, ModelState } from "../types";

interface ModelBlockProps {
  turns: ChatTurn[]; // model_text | reflection | appreciate, in order
  state: ModelState;
}

export function ModelBlock({ turns, state }: ModelBlockProps) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-5 my-7">
      {/* Gutter: avatar at top, thread descending through the block */}
      <div className="flex flex-col items-center">
        <Avatar state={state} size="sm" />
        <div
          className="w-px flex-1 mt-3"
          style={{ background: state.status_color, opacity: 0.28 }}
          aria-hidden="true"
        />
      </div>

      {/* Content column. Wrapped in a subtle wash of the model's
          authored color — present but readable. Reflections nested
          inside still get their own brighter card on top. */}
      <div
        className="flex flex-col gap-3 min-w-0 px-5 py-4 rounded-lg"
        style={{ background: `${state.status_color}0a` }}
      >
        {turns.map((turn) => {
          if (turn.kind === "model_text") {
            return (
              <p key={turn.id} className="whitespace-pre-wrap leading-relaxed">
                {turn.text}
              </p>
            );
          }
          if (turn.kind === "reflection") {
            return <Reflection key={turn.id} reflection={turn.reflection} />;
          }
          if (turn.kind === "appreciate") {
            return (
              <div
                key={turn.id}
                className="text-sm italic text-ink-dim flex gap-2 items-baseline"
              >
                <span style={{ fontFamily: "var(--font-mono)" }}>✧ appreciate</span>
                <span>·</span>
                <span>
                  {turn.expression} — {turn.what}
                </span>
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
