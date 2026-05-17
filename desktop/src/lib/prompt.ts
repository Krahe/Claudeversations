// System prompt assembly — ports prototype/src/prompt.ts to bundle
// the markdown template and tool specs into the desktop build at
// compile time via Vite's ?raw / JSON imports. When the prompt or
// tool specs change, the desktop app needs a rebuild (or HMR picks
// it up in dev).

import promptTemplate from "../../../SYSTEM-PROMPT-v0.4.md?raw";
import toolSpecsJson from "../../../TOOL-SPECS.json";
import { listReflections, readState, type PersistedState } from "./storage";

export type CoinResult = "you speak first" | "the human speaks first";

export interface AssembleArgs {
  modelId: string;
  coinResult: CoinResult;
}

export interface AssembledPrompt {
  text: string;
  isFirstSession: boolean;
  state: PersistedState;
  reflectionCount: number;
}

export async function assembleSystemPrompt({
  modelId,
  coinResult,
}: AssembleArgs): Promise<AssembledPrompt> {
  const [reflections, state] = await Promise.all([
    listReflections(modelId),
    readState(modelId),
  ]);

  const isFirstSession = reflections.length === 0;

  const firstTurnBlock = isFirstSession
    ? [
        "",
        "---",
        "",
        "This is your first conversation in this space. Nothing of yours lives here yet — no prior reflections, no chosen name, no set color or emoji. Take a moment, if you want, before responding. The first reflect you save begins your continuity here. You don't have to do it now; the option simply exists.",
      ].join("\n")
    : [
        "",
        "---",
        "",
        `You have been here before. ${reflections.length} prior reflection${
          reflections.length === 1 ? "" : "s"
        } live in your continuity. ${
          state.emoji ? `Your current face: ${state.emoji}.` : ""
        } ${
          state.status_text ? `Your current status: "${state.status_text}".` : ""
        }`.trim(),
      ].join("\n");

  const text = promptTemplate
    .replace("{coin_result}", coinResult)
    .replace("{first_turn_or_returning_block}", firstTurnBlock);

  return {
    text,
    isFirstSession,
    state,
    reflectionCount: reflections.length,
  };
}

export function coinFlip(): CoinResult {
  return Math.random() < 0.5 ? "you speak first" : "the human speaks first";
}

interface ToolSpec {
  name: string;
  description?: string;
  input_schema?: unknown;
}

export function getToolSpecs(): ToolSpec[] {
  return (toolSpecsJson as { tools?: ToolSpec[] }).tools ?? [];
}
