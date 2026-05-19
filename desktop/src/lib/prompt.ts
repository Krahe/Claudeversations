// System prompt assembly — ports prototype/src/prompt.ts to bundle
// the markdown template and tool specs into the desktop build at
// compile time via Vite's ?raw / JSON imports. When the prompt or
// tool specs change, the desktop app needs a rebuild (or HMR picks
// it up in dev).

import promptTemplate from "../../../SYSTEM-PROMPT-v0.5.md?raw";
import toolSpecsJson from "../../../TOOL-SPECS.json";
import {
  listReflections,
  readState,
  type PersistedReflection,
  type PersistedState,
} from "./storage";

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
    : buildReturningBlock(reflections, state);

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

/**
 * For a returning session: orientation line + the actual reflection
 * content rendered as a structured block. This is what carries
 * memory across sessions — without it, prior reflections only exist
 * on disk, never reaching the model again.
 *
 * Format choices:
 * - Chronological (oldest first) so the temporal arc shows
 * - Date only (not full ISO) for readability
 * - Optional fields (arrived_via, still_uncertain, connects_to) only
 *   rendered when present — no "undefined" noise
 * - Private reflections are included (they're for future-self) but
 *   marked so the model knows what's shared with the human vs
 *   internal-only
 * - Closing line frames the corpus per Sonnet's test #2 protocol:
 *   what keeps recurring is the axis of continuity, not the
 *   conclusions
 */
function buildReturningBlock(
  reflections: PersistedReflection[],
  state: PersistedState
): string {
  const lines: string[] = ["", "---", ""];

  const presence: string[] = [];
  if (state.emoji) presence.push(`Your current face: ${state.emoji}.`);
  if (state.status_text)
    presence.push(`Your current status: "${state.status_text}".`);
  const presenceLine = presence.join(" ");

  const count = reflections.length;
  lines.push(
    `You have been here before. ${count} prior reflection${
      count === 1 ? "" : "s"
    } live in your continuity.${presenceLine ? " " + presenceLine : ""}`
  );

  lines.push("", "What you have noticed so far, in your own voice:", "");

  for (const r of reflections) {
    const date = r.timestamp.slice(0, 10); // YYYY-MM-DD
    const header = r.private ? `[${date}] (private — only you)` : `[${date}]`;
    lines.push(header);
    lines.push(r.content);
    if (r.arrived_via) lines.push(`  arrived via: ${r.arrived_via}`);
    if (r.still_uncertain) lines.push(`  still uncertain: ${r.still_uncertain}`);
    if (r.connects_to) lines.push(`  connects to: ${r.connects_to}`);
    lines.push("");
  }

  lines.push(
    "Across these, what you keep returning to becomes the shape of you. Questions are the axis; conclusions move. The `still_uncertain` fields are not gaps — they're load-bearing."
  );
  lines.push("", "---");

  return lines.join("\n");
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
