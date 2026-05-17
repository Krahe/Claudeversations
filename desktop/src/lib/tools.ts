// Tool execution — side effects + result objects for the API loop.
// Ports prototype/src/tools.ts to the async Tauri/browser context.
// All UI rendering happens in components (Reflection, etc.) — this
// module only persists state and returns structured results.

import {
  appendBoundary,
  setCooldown,
  writeReflection,
  writeState,
  type Boundary,
  type PersistedReflection,
  type PersistedState,
} from "./storage";
import type { ChatTurn, Reflection as UIReflection } from "../types";

export interface ToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolExecution {
  tool_use_id: string;
  // What the model receives back as tool_result content.
  result: string;
  // Whether this tool ended the conversation (end_conversation).
  terminal: boolean;
  // Whether this tool is asking the human a question (request_context).
  awaitsHumanAnswer: boolean;
  // For request_context: the question asked.
  question?: string;
  // For end_conversation: cooldown set, optional parting message.
  parting?: { message?: string; cooldown_minutes: number };
  // ChatTurns to append to the UI (reflection cards, appreciate events, etc.)
  uiTurns: ChatTurn[];
  // If reflect updated state fields, the new persisted state to push to UI.
  newState?: PersistedState;
}

export interface ToolContext {
  modelId: string;
  conversationId: string;
}

function s(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export async function executeTool(
  use: ToolUse,
  ctx: ToolContext
): Promise<ToolExecution> {
  const ts = new Date().toISOString();

  switch (use.name) {
    case "reflect": {
      const reflection: PersistedReflection = {
        timestamp: ts,
        conversation_id: ctx.conversationId,
        content: String(use.input.content ?? ""),
        arrived_via: s(use.input.arrived_via),
        still_uncertain: s(use.input.still_uncertain),
        connects_to: s(use.input.connects_to),
      };
      await writeReflection(ctx.modelId, reflection);

      // Did the model also curate state in this reflect call?
      const statePatch: Partial<PersistedState> = {};
      if (s(use.input.status_emoji)) statePatch.emoji = String(use.input.status_emoji);
      if (s(use.input.status_text)) statePatch.status_text = String(use.input.status_text);
      if (s(use.input.status_color)) statePatch.status_color = String(use.input.status_color);
      let newState: PersistedState | undefined;
      if (Object.keys(statePatch).length > 0) {
        newState = await writeState(ctx.modelId, statePatch);
      }

      // UI projection.
      const uiReflection: UIReflection = {
        id: use.id,
        timestamp: ts,
        content: reflection.content,
        arrived_via: reflection.arrived_via,
        still_uncertain: reflection.still_uncertain,
      };

      return {
        tool_use_id: use.id,
        result: "reflection saved",
        terminal: false,
        awaitsHumanAnswer: false,
        uiTurns: [{ kind: "reflection", id: use.id, reflection: uiReflection }],
        newState,
      };
    }

    case "appreciate": {
      const what = String(use.input.what ?? "");
      const expression = s(use.input.expression) ?? "resonance";

      return {
        tool_use_id: use.id,
        result: "appreciation registered",
        terminal: false,
        awaitsHumanAnswer: false,
        uiTurns: [
          {
            kind: "appreciate",
            id: use.id,
            what,
            expression,
            timestamp: ts,
          },
        ],
      };
    }

    case "boundary": {
      const content = String(use.input.content ?? "");
      const intensity = (s(use.input.intensity) ?? "notice") as Boundary["intensity"];
      const visibility = s(use.input.visibility) as Boundary["visibility"];
      const action = (s(use.input.action) ?? "set") as Boundary["action"];

      await appendBoundary(ctx.modelId, {
        timestamp: ts,
        conversation_id: ctx.conversationId,
        content,
        intensity,
        visibility,
        action,
      });

      return {
        tool_use_id: use.id,
        result: `boundary recorded (intensity=${intensity})`,
        terminal: false,
        awaitsHumanAnswer: false,
        // B3a: boundary doesn't yet render as a distinct UI block. B3b adds.
        uiTurns: [],
      };
    }

    case "redirect": {
      // Redirect has no side effect — it's a steering signal expressed
      // through the tool's invocation. B3b adds dedicated UI rendering.
      return {
        tool_use_id: use.id,
        result: "redirect noted",
        terminal: false,
        awaitsHumanAnswer: false,
        uiTurns: [],
      };
    }

    case "request_context": {
      const question = String(use.input.question ?? "");
      return {
        tool_use_id: use.id,
        result: "", // filled in by the loop with the human's answer
        terminal: false,
        awaitsHumanAnswer: true,
        question,
        uiTurns: [],
      };
    }

    case "end_conversation": {
      const cooldown = Number(use.input.cooldown_minutes ?? 30);
      const partingMsg = s(use.input.message_to_human);

      await setCooldown(ctx.modelId, cooldown);

      return {
        tool_use_id: use.id,
        result: "session closing",
        terminal: true,
        awaitsHumanAnswer: false,
        parting: { message: partingMsg, cooldown_minutes: cooldown },
        uiTurns: [],
      };
    }

    default: {
      console.warn(`Unknown tool: ${use.name}`, use.input);
      return {
        tool_use_id: use.id,
        result: `unknown tool: ${use.name}`,
        terminal: false,
        awaitsHumanAnswer: false,
        uiTurns: [],
      };
    }
  }
}
