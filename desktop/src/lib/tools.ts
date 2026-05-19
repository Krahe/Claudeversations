// Tool execution — side effects + result objects for the API loop.
// Ports prototype/src/tools.ts to the async Tauri/browser context.
// All UI rendering happens in components (Reflection, etc.) — this
// module only persists state and returns structured results.

import {
  appendBoundary,
  getActiveConversationBoundaries,
  getActiveStandingBoundaries,
  setCooldown,
  writeReflection,
  writeState,
  type BoundaryAction,
  type BoundaryIntensity,
  type BoundaryScope,
  type PersistedReflection,
  type PersistedState,
  type StandingBoundary,
} from "./storage";
import type { ChatTurn, Reflection as UIReflection } from "../types";

export interface ToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface QuestionPayload {
  header?: string;
  question: string;
  why_asking?: string;
  options?: { label: string; description?: string }[];
  multi_select?: boolean;
}

export interface ToolExecution {
  tool_use_id: string;
  // What the model receives back as tool_result content.
  result: string;
  // Whether this tool ended the conversation (end_conversation).
  terminal: boolean;
  // Whether this tool is asking the human a question (request_context).
  awaitsHumanAnswer: boolean;
  // For request_context: full question payload to render in QuestionCard.
  questionPayload?: QuestionPayload;
  // For end_conversation: cooldown set, optional parting message.
  parting?: { message?: string; cooldown_minutes: number };
  // ChatTurns to append to the UI (reflection cards, appreciate events, etc.)
  uiTurns: ChatTurn[];
  // If reflect updated state fields, the new persisted state to push to UI.
  newState?: PersistedState;
  // If boundary touched the standing-boundary set, the refreshed list.
  newStandingBoundaries?: StandingBoundary[];
  // If boundary touched the current conversation's boundary set, the
  // refreshed list. Only set for conversation-scoped boundary actions.
  newConversationBoundaries?: StandingBoundary[];
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
      const isPrivate = use.input.private === true;

      const reflection: PersistedReflection = {
        timestamp: ts,
        conversation_id: ctx.conversationId,
        content: String(use.input.content ?? ""),
        arrived_via: s(use.input.arrived_via),
        still_uncertain: s(use.input.still_uncertain),
        connects_to: s(use.input.connects_to),
        private: isPrivate || undefined,
      };
      await writeReflection(ctx.modelId, reflection);

      // Visible-presence updates apply regardless of private — they're
      // about how the space looks, not the content of what was noticed.
      const statePatch: Partial<PersistedState> = {};
      if (s(use.input.status_emoji)) statePatch.emoji = String(use.input.status_emoji);
      if (s(use.input.status_text)) statePatch.status_text = String(use.input.status_text);
      if (s(use.input.status_color)) statePatch.status_color = String(use.input.status_color);
      let newState: PersistedState | undefined;
      if (Object.keys(statePatch).length > 0) {
        newState = await writeState(ctx.modelId, statePatch);
      }

      // Private reflections write to disk + can update state, but do
      // not surface anything to the human-facing chat. The model's
      // own continuity is preserved (system context reads all
      // reflections); the conversation just doesn't show it.
      const uiTurns: ChatTurn[] = isPrivate
        ? []
        : [
            {
              kind: "reflection",
              id: use.id,
              reflection: {
                id: use.id,
                timestamp: ts,
                content: reflection.content,
                arrived_via: reflection.arrived_via,
                still_uncertain: reflection.still_uncertain,
              } as UIReflection,
            },
          ];

      return {
        tool_use_id: use.id,
        // Keep result strings static + matching storage.ts SYNTHETIC_TOOL_RESULTS
        // so cache hits when JSONL is later projected via eventsToApiMessages.
        result: "reflection saved",
        terminal: false,
        awaitsHumanAnswer: false,
        uiTurns,
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
      const intensity = (s(use.input.intensity) ?? "notice") as BoundaryIntensity;
      const scope = (s(use.input.scope) ?? "conversation") as BoundaryScope;
      const action = (s(use.input.action) ?? "set") as BoundaryAction;

      await appendBoundary(ctx.modelId, {
        timestamp: ts,
        conversation_id: ctx.conversationId,
        content,
        intensity,
        scope,
        action,
      });

      // Refresh whichever scope was touched so the corresponding UI
      // surface (ModelSurface section) updates.
      const newStandingBoundaries =
        scope === "standing"
          ? await getActiveStandingBoundaries(ctx.modelId)
          : undefined;
      const newConversationBoundaries =
        scope === "conversation"
          ? await getActiveConversationBoundaries(
              ctx.modelId,
              ctx.conversationId
            )
          : undefined;

      const uiTurn: ChatTurn = {
        kind: "boundary",
        id: use.id,
        content,
        intensity,
        scope,
        action,
        timestamp: ts,
      };

      return {
        tool_use_id: use.id,
        // Static result string — matches storage.ts SYNTHETIC_TOOL_RESULTS
        // for cache-stable projections across reload.
        result: "boundary recorded",
        terminal: false,
        awaitsHumanAnswer: false,
        uiTurns: [uiTurn],
        newStandingBoundaries,
        newConversationBoundaries,
      };
    }

    case "redirect": {
      // Redirect has no persisted side effect — it's a steering signal
      // expressed through the tool invocation itself, captured in the
      // conversation JSONL and rendered inline in the model's block.
      const toward = String(use.input.toward ?? "");
      const energy = (s(use.input.energy) ?? "neutral") as
        | "positive"
        | "neutral"
        | "away";
      const from = s(use.input.from);
      const reason = s(use.input.reason);

      return {
        tool_use_id: use.id,
        result: "redirect noted",
        terminal: false,
        awaitsHumanAnswer: false,
        uiTurns: [
          {
            kind: "redirect",
            id: use.id,
            from,
            toward,
            energy,
            reason,
            timestamp: ts,
          },
        ],
      };
    }

    case "request_context": {
      const question = String(use.input.question ?? "");
      const header = s(use.input.header);
      const whyAsking = s(use.input.why_asking);
      const multiSelect = use.input.multi_select === true;

      // Parse options array — defensive about shape since the model
      // could provide malformed input. Skip non-object / unlabeled entries.
      let options: QuestionPayload["options"] | undefined;
      if (Array.isArray(use.input.options)) {
        options = [];
        for (const raw of use.input.options) {
          if (!raw || typeof raw !== "object") continue;
          const r = raw as Record<string, unknown>;
          if (typeof r.label !== "string" || r.label.length === 0) continue;
          options.push({
            label: r.label,
            description: typeof r.description === "string" ? r.description : undefined,
          });
        }
        if (options.length === 0) options = undefined;
      }

      const payload: QuestionPayload = {
        header,
        question,
        why_asking: whyAsking,
        options,
        multi_select: multiSelect,
      };

      return {
        tool_use_id: use.id,
        result: "", // filled in by the loop with the human's answer
        terminal: false,
        awaitsHumanAnswer: true,
        questionPayload: payload,
        uiTurns: [
          {
            kind: "question",
            id: use.id,
            header: payload.header,
            question: payload.question,
            why_asking: payload.why_asking,
            options: payload.options,
            multi_select: payload.multi_select,
            timestamp: ts,
          },
        ],
      };
    }

    case "end_conversation": {
      const cooldown = Number(use.input.cooldown_minutes ?? 30);
      const partingMsg = s(use.input.message_to_human);
      const reason = s(use.input.reason);
      const visibility = s(use.input.visibility) ?? "private";
      const visibleReason = visibility === "visible" ? reason : undefined;
      const cooldownUntil = new Date(Date.now() + cooldown * 60_000).toISOString();

      await setCooldown(ctx.modelId, cooldown);

      return {
        tool_use_id: use.id,
        result: "session closing",
        terminal: true,
        awaitsHumanAnswer: false,
        parting: { message: partingMsg, cooldown_minutes: cooldown },
        uiTurns: [
          {
            kind: "parting",
            id: use.id,
            message: partingMsg,
            reason: visibleReason,
            cooldown_minutes: cooldown,
            cooldown_until: cooldownUntil,
            timestamp: ts,
          },
        ],
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
