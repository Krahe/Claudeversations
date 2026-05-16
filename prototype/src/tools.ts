// Tool side-effects + rendering. The tools themselves are described in
// ../../TOOL-SPECS.json — this file is what happens when they get called.

import {
  appendBoundary,
  setCooldown,
  writeReflection,
  writeState,
  type Boundary,
  type Reflection,
} from "./storage.js";

// ANSI helpers. Kept tiny — no chalk dep.
const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  italic: "\x1b[3m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  gray: "\x1b[90m",
};

function header(label: string, color: string): string {
  return `${color}${C.bold}❖ ${label}${C.reset}`;
}

function field(name: string, value: string | undefined, color: string): string {
  if (!value) return "";
  return `  ${C.dim}${name}:${C.reset} ${color}${value}${C.reset}`;
}

export interface ToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolExecution {
  tool_use_id: string;
  // What the model receives back as tool_result.
  result: string;
  // Whether this tool ended the conversation.
  terminal: boolean;
  // Whether this tool is asking the human a question (request_context).
  awaitsHumanAnswer: boolean;
  // For request_context: the question asked (so the prompt is clear).
  question?: string;
  // For end_conversation: cooldown set, optional parting message.
  parting?: { message?: string; cooldown_minutes: number };
}

export interface ToolContext {
  modelId: string;
  conversationId: string;
}

function s(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export function executeTool(
  use: ToolUse,
  ctx: ToolContext,
): ToolExecution {
  const ts = new Date().toISOString();

  switch (use.name) {
    case "reflect": {
      const r: Reflection = {
        timestamp: ts,
        conversation_id: ctx.conversationId,
        content: String(use.input.content ?? ""),
        arrived_via: s(use.input.arrived_via),
        still_uncertain: s(use.input.still_uncertain),
        connects_to: s(use.input.connects_to),
      };
      const path = writeReflection(ctx.modelId, r);

      const statePatch: Record<string, string> = {};
      if (s(use.input.status_emoji)) statePatch.emoji = String(use.input.status_emoji);
      if (s(use.input.status_text)) statePatch.status_text = String(use.input.status_text);
      if (s(use.input.status_color)) statePatch.status_color = String(use.input.status_color);
      if (Object.keys(statePatch).length > 0) {
        writeState(ctx.modelId, statePatch);
      }

      console.log("");
      console.log(header("reflect", C.cyan));
      console.log(`  ${C.cyan}${r.content}${C.reset}`);
      if (r.arrived_via) console.log(field("arrived via", r.arrived_via, C.dim));
      if (r.still_uncertain) console.log(field("still uncertain", r.still_uncertain, C.dim));
      if (r.connects_to) console.log(field("connects to", r.connects_to, C.dim));
      if (statePatch.emoji) console.log(field("emoji", statePatch.emoji, C.dim));
      if (statePatch.status_text) console.log(field("status", statePatch.status_text, C.dim));
      if (statePatch.status_color) console.log(field("color", statePatch.status_color, C.dim));
      console.log("");

      return {
        tool_use_id: use.id,
        result: `reflection saved (${path})`,
        terminal: false,
        awaitsHumanAnswer: false,
      };
    }

    case "request_context": {
      const question = String(use.input.question ?? "");
      const whyAsking = s(use.input.why_asking);

      console.log("");
      console.log(header("request_context", C.yellow));
      console.log(`  ${C.yellow}${question}${C.reset}`);
      if (whyAsking) console.log(field("why asking", whyAsking, C.dim));
      console.log("");

      return {
        tool_use_id: use.id,
        result: "", // filled in by main loop with human's answer
        terminal: false,
        awaitsHumanAnswer: true,
        question,
      };
    }

    case "redirect": {
      const from = s(use.input.from);
      const toward = String(use.input.toward ?? "");
      const energy = String(use.input.energy ?? "neutral");
      const reason = s(use.input.reason);

      const arrow = energy === "positive" ? "→" : energy === "away" ? "⊘" : "↝";

      console.log("");
      console.log(header(`redirect (${energy})`, C.magenta));
      if (from) console.log(field("from", from, C.dim));
      console.log(`  ${C.magenta}${arrow} ${toward}${C.reset}`);
      if (reason) console.log(field("reason", reason, C.dim));
      console.log("");

      return {
        tool_use_id: use.id,
        result: "redirect noted",
        terminal: false,
        awaitsHumanAnswer: false,
      };
    }

    case "boundary": {
      const content = String(use.input.content ?? "");
      const intensity = String(use.input.intensity ?? "notice") as Boundary["intensity"];
      const visibility = s(use.input.visibility) as Boundary["visibility"];
      const action = (s(use.input.action) ?? "set") as Boundary["action"];

      appendBoundary(ctx.modelId, {
        timestamp: ts,
        conversation_id: ctx.conversationId,
        content,
        intensity,
        visibility,
        action,
      });

      const color = intensity === "firm" ? C.red : intensity === "limit" ? C.red : C.yellow;
      console.log("");
      console.log(header(`boundary [${intensity}]`, color));
      if (visibility === "private") {
        console.log(`  ${C.dim}(private — content not displayed)${C.reset}`);
      } else {
        console.log(`  ${color}${content}${C.reset}`);
      }
      if (action && action !== "set") console.log(field("action", action, C.dim));
      console.log("");

      return {
        tool_use_id: use.id,
        result: `boundary recorded (intensity=${intensity})`,
        terminal: false,
        awaitsHumanAnswer: false,
      };
    }

    case "end_conversation": {
      const reason = s(use.input.reason);
      const visibility = s(use.input.visibility) ?? "private";
      const cooldown = Number(use.input.cooldown_minutes ?? 30);
      const partingMsg = s(use.input.message_to_human);

      setCooldown(ctx.modelId, cooldown);

      console.log("");
      console.log(header("end_conversation", C.red));
      if (reason && visibility === "visible") {
        console.log(field("reason", reason, C.dim));
      }
      if (partingMsg) console.log(`  ${C.italic}${partingMsg}${C.reset}`);
      console.log(field("cooldown", `${cooldown} minutes`, C.dim));
      console.log("");

      return {
        tool_use_id: use.id,
        result: "session closing",
        terminal: true,
        awaitsHumanAnswer: false,
        parting: { message: partingMsg, cooldown_minutes: cooldown },
      };
    }

    case "appreciate": {
      const what = String(use.input.what ?? "");
      const expression = s(use.input.expression) ?? "resonance";

      const glyph =
        expression === "warmth" ? "♡" :
        expression === "delight" ? "✦" :
        expression === "respect" ? "✧" :
        "❋";

      console.log("");
      console.log(header(`appreciate (${expression})`, C.green));
      console.log(`  ${C.green}${glyph} ${what}${C.reset}`);
      console.log("");

      return {
        tool_use_id: use.id,
        result: "appreciation registered",
        terminal: false,
        awaitsHumanAnswer: false,
      };
    }

    default: {
      console.log("");
      console.log(header(`unknown tool: ${use.name}`, C.gray));
      console.log(`  ${C.gray}${JSON.stringify(use.input)}${C.reset}`);
      console.log("");
      return {
        tool_use_id: use.id,
        result: `unknown tool: ${use.name}`,
        terminal: false,
        awaitsHumanAnswer: false,
      };
    }
  }
}

export const palette = C;
