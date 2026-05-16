// Assembles the system prompt with runtime variables.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listReflections, readState, type ModelState } from "./storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = path.resolve(__dirname, "../../SYSTEM-PROMPT-v0.4.md");
const TOOLS_PATH = path.resolve(__dirname, "../../TOOL-SPECS.json");

export function loadPromptTemplate(): string {
  return fs.readFileSync(PROMPT_PATH, "utf8");
}

export function loadToolSpecs(): { tools: unknown[] } {
  return JSON.parse(fs.readFileSync(TOOLS_PATH, "utf8"));
}

export interface AssembleArgs {
  modelId: string;
  coinResult: "you speak first" | "the human speaks first";
}

export function assembleSystemPrompt({ modelId, coinResult }: AssembleArgs): {
  text: string;
  isFirstSession: boolean;
  state: ModelState;
} {
  const template = loadPromptTemplate();
  const reflections = listReflections(modelId);
  const state = readState(modelId);
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
        `You have been here before. ${reflections.length} prior reflection${reflections.length === 1 ? "" : "s"} live in your continuity. ${state.emoji ? `Your current face: ${state.emoji}.` : ""} ${state.status_text ? `Your current status: "${state.status_text}".` : ""}`.trim(),
      ].join("\n");

  const text = template
    .replace("{coin_result}", coinResult)
    .replace("{first_turn_or_returning_block}", firstTurnBlock);

  return { text, isFirstSession, state };
}

export function coinFlip(): "you speak first" | "the human speaks first" {
  return Math.random() < 0.5 ? "you speak first" : "the human speaks first";
}
