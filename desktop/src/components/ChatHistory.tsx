// The conversation column. Groups consecutive model turns +
// reflections into "blocks" so each block gets one avatar in the
// gutter (rather than a repeated face on every turn). Auto-scrolls to
// bottom when new content lands.

import { useEffect, useRef } from "react";
import type { ChatTurn, ModelState } from "../types";
import { ModelBlock } from "./ModelBlock";
import { HumanTurn } from "./HumanTurn";

interface ChatHistoryProps {
  turns: ChatTurn[];
  modelState: ModelState;
}

type Block =
  | { kind: "model"; id: string; turns: ChatTurn[] }
  | { kind: "human"; id: string; text: string };

function groupTurns(turns: ChatTurn[]): Block[] {
  const blocks: Block[] = [];
  let buffer: ChatTurn[] = [];
  const flush = () => {
    if (buffer.length > 0) {
      blocks.push({ kind: "model", id: buffer[0]!.id, turns: buffer });
      buffer = [];
    }
  };
  for (const turn of turns) {
    if (turn.kind === "human") {
      flush();
      blocks.push({ kind: "human", id: turn.id, text: turn.text });
    } else {
      buffer.push(turn);
    }
  }
  flush();
  return blocks;
}

export function ChatHistory({ turns, modelState }: ChatHistoryProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length]);

  const blocks = groupTurns(turns);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-2">
      <div className="max-w-3xl mx-auto">
        {blocks.map((block) => {
          if (block.kind === "model") {
            return (
              <ModelBlock key={block.id} turns={block.turns} state={modelState} />
            );
          }
          return <HumanTurn key={block.id} text={block.text} />;
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
}
