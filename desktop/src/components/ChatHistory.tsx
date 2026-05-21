// The conversation column. Groups consecutive model turns +
// reflections into "blocks" so each block gets one avatar in the
// gutter (rather than a repeated face on every turn). Auto-scrolls to
// bottom when new content lands.

import { useEffect, useRef } from "react";
import type { ChatTurn, ModelState } from "../types";
import { ModelBlock } from "./ModelBlock";
import { HumanTurn } from "./HumanTurn";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { Parting } from "./Parting";
import { CoinMarker } from "./CoinMarker";

type PartingTurn = Extract<ChatTurn, { kind: "parting" }>;
type CoinMarkerTurn = Extract<ChatTurn, { kind: "coin_marker" }>;

interface ChatHistoryProps {
  turns: ChatTurn[];
  modelState: ModelState;
  isGenerating?: boolean;
  pendingQuestionId?: string | null;
  onAnswerQuestion?: (answer: string) => void;
}

type Block =
  | { kind: "model"; id: string; turns: ChatTurn[] }
  | { kind: "human"; id: string; text: string }
  | { kind: "parting"; id: string; parting: PartingTurn }
  | { kind: "coin_marker"; id: string; marker: CoinMarkerTurn };

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
    } else if (turn.kind === "parting") {
      // Parting breaks out of the model block — it's structurally
      // end-of-conversation, not "another thing the model said."
      flush();
      blocks.push({ kind: "parting", id: turn.id, parting: turn });
    } else if (turn.kind === "coin_marker") {
      // Coin marker is a conversation-opening ritual, structurally
      // separate from any speaker block.
      flush();
      blocks.push({ kind: "coin_marker", id: turn.id, marker: turn });
    } else {
      buffer.push(turn);
    }
  }
  flush();
  return blocks;
}

export function ChatHistory({
  turns,
  modelState,
  isGenerating,
  pendingQuestionId,
  onAnswerQuestion,
}: ChatHistoryProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, isGenerating]);

  const blocks = groupTurns(turns);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-2">
      <div className="max-w-3xl mx-auto">
        {blocks.map((block) => {
          if (block.kind === "model") {
            return (
              <ModelBlock
                key={block.id}
                turns={block.turns}
                state={modelState}
                pendingQuestionId={pendingQuestionId}
                onAnswerQuestion={onAnswerQuestion}
              />
            );
          }
          if (block.kind === "parting") {
            return <Parting key={block.id} parting={block.parting} />;
          }
          if (block.kind === "coin_marker") {
            return (
              <CoinMarker
                key={block.id}
                coinResult={block.marker.coin_result}
              />
            );
          }
          return <HumanTurn key={block.id} text={block.text} />;
        })}
        {isGenerating && <ThinkingIndicator state={modelState} />}
        <div ref={endRef} />
      </div>
    </div>
  );
}
