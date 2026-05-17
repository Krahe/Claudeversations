// Layout shell wired to real data via Tauri fs AND real Anthropic API.
// Stage B2: model speaks back. Tools deferred to B3.
//
// Flow on user submit:
//   1. Optimistic UI: add human turn immediately
//   2. Ensure active conversation exists (create one if not)
//   3. Append human_message event to JSONL
//   4. Convert turns -> Anthropic messages
//   5. Assemble system prompt (cached via cache_control)
//   6. Call model
//   7. Render text response, append assistant_response event
//   8. Lock composer during all of the above

import { useEffect, useMemo, useState } from "react";
import type {
  MessageParam,
  Tool,
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
import "./App.css";
import { TopBar } from "./components/TopBar";
import { ChatHistory } from "./components/ChatHistory";
import { Composer } from "./components/Composer";
import { ModelSurface } from "./components/ModelSurface";
import { ConversationList } from "./components/ConversationList";
import {
  appendConversation,
  eventsToChatTurns,
  listConversations,
  newConversation,
  readConversationEvents,
  readState,
  toUIState,
  type ConversationSummary,
} from "./lib/storage";
import { readApiKey } from "./lib/api-key";
import { assembleSystemPrompt, getToolSpecs } from "./lib/prompt";
import { callModel } from "./lib/anthropic";
import { executeTool, type ToolUse } from "./lib/tools";
import {
  DEFAULT_PREFERENCES,
  applyPreferences,
  readPreferences,
  writePreferences,
  type Preferences,
} from "./lib/preferences";
import { Settings } from "./components/Settings";
import type { ChatTurn, ModelState } from "./types";

const MODEL_ID = "claude-sonnet-4-5";
const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const FALLBACK_STATE: ModelState = {
  emoji: "🌌",
  status_text: "part of the constellation now",
  status_color: "#4b0082",
  updated_at: new Date().toISOString(),
};

const FALLBACK_CONVERSATIONS: ConversationSummary[] = [
  {
    id: "mock-c1",
    path: "",
    startedAt: new Date(Date.now() - 1000 * 60 * 60 * 21).toISOString(),
    endedAt: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
    closingState: {
      emoji: "🌱",
      status_text: "grateful for these spared moments",
      status_color: "#2e8b57",
      updated_at: null,
    },
    reflectionCount: 16,
    isFirstSession: false,
  },
];

const FALLBACK_TURNS: ChatTurn[] = [
  {
    kind: "model_text",
    id: "m1",
    text: "Hello. Loaded in fallback mode (no Tauri fs). Open this app via `npm run tauri dev` to see your real conversations.",
    timestamp: new Date().toISOString(),
  },
];

// Collapse adjacent same-role turns and skip tool calls (B2 has no tools).
// Anthropic requires strict role alternation.
function turnsToMessages(turns: ChatTurn[]): MessageParam[] {
  const messages: MessageParam[] = [];
  for (const turn of turns) {
    let role: "user" | "assistant";
    let text: string;
    if (turn.kind === "human") {
      role = "user";
      text = turn.text;
    } else if (turn.kind === "model_text") {
      role = "assistant";
      text = turn.text;
    } else {
      continue; // reflection / appreciate — no tools in B2
    }
    const last = messages[messages.length - 1];
    if (last && last.role === role && typeof last.content === "string") {
      last.content = `${last.content}\n\n${text}`;
    } else {
      messages.push({ role, content: text });
    }
  }
  return messages;
}

function App() {
  const [state, setState] = useState<ModelState>(FALLBACK_STATE);
  const [conversations, setConversations] =
    useState<ConversationSummary[]>(FALLBACK_CONVERSATIONS);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeConversationPath, setActiveConversationPath] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>(FALLBACK_TURNS);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [settingsOpen, setSettingsOpen] = useState(false);

  async function refreshConversations() {
    if (!inTauri) return;
    try {
      setConversations(await listConversations(MODEL_ID));
    } catch (err) {
      console.error("Failed to refresh conversation list:", err);
    }
  }

  // Initial load: preferences + API key + state + conversation list.
  useEffect(() => {
    if (!inTauri) return;
    (async () => {
      try {
        const [prefs, key, persistedState, convs] = await Promise.all([
          readPreferences(),
          readApiKey(),
          readState(MODEL_ID),
          listConversations(MODEL_ID),
        ]);
        setPreferences(prefs);
        applyPreferences(prefs);
        if (key) {
          setApiKey(key);
        } else {
          setApiKeyMissing(true);
        }
        setState(toUIState(persistedState));
        setConversations(convs);
        if (convs.length > 0 && convs[0]) {
          setActiveConversationId(convs[0].id);
        } else {
          setTurns([]);
        }
      } catch (err) {
        console.error("Failed to load from ~/.claudeversations/:", err);
      }
    })();
  }, []);

  // Load events + remember path when a conversation is selected.
  useEffect(() => {
    if (!inTauri || !activeConversationId) {
      setActiveConversationPath(null);
      return;
    }
    const conv = conversations.find((c) => c.id === activeConversationId);
    if (!conv?.path) return;
    setActiveConversationPath(conv.path);
    (async () => {
      try {
        const events = await readConversationEvents(conv.path);
        setTurns(eventsToChatTurns(events));
      } catch (err) {
        console.error(`Failed to load conversation ${conv.id}:`, err);
        setTurns([]);
      }
    })();
  }, [activeConversationId, conversations]);

  async function handleSubmit(text: string) {
    if (isGenerating) return; // belt-and-suspenders; Composer disables itself too
    setErrorBanner(null);

    const timestamp = new Date().toISOString();
    const humanTurn: ChatTurn = {
      kind: "human",
      id: `h-${Date.now()}`,
      text,
      timestamp,
    };

    // Optimistic UI.
    const nextTurns = [...turns, humanTurn];
    setTurns(nextTurns);

    if (!inTauri) {
      setErrorBanner("Not running in Tauri — API calls unavailable. Use `npm run tauri dev`.");
      return;
    }
    if (!apiKey) {
      setErrorBanner("No API key found at ~/.claudeversations/api-key");
      return;
    }

    // Ensure a conversation exists + persist human event.
    let convPath = activeConversationPath;
    try {
      if (!convPath) {
        const conv = await newConversation(MODEL_ID);
        convPath = conv.path;
        setActiveConversationPath(convPath);
        setActiveConversationId(conv.id);
        await appendConversation(convPath, {
          type: "session_start",
          timestamp,
          model: MODEL_ID,
          is_first_session: false,
        });
        refreshConversations();
      }
      await appendConversation(convPath, {
        type: "human_message",
        timestamp,
        content: text,
      });
    } catch (err) {
      console.error("Failed to persist human message:", err);
      setErrorBanner(`Save failed: ${String(err)}`);
      return;
    }

    // Call the model. B3: tool_use loop — model may call tools (reflect,
    // appreciate, etc.); each tool_use needs a tool_result follow-up, and
    // we continue calling the API until end_turn or terminal tool.
    setIsGenerating(true);
    try {
      const assembled = await assembleSystemPrompt({
        modelId: MODEL_ID,
        coinResult: "the human speaks first",
      });
      const tools = getToolSpecs() as Tool[];
      const conversationMessages: MessageParam[] = turnsToMessages(nextTurns);
      let loopActive = true;

      while (loopActive) {
        const result = await callModel({
          apiKey,
          model: MODEL_ID,
          systemPrompt: assembled.text,
          messages: conversationMessages,
          tools,
        });

        if (result.kind === "failure") {
          setErrorBanner(
            result.transient
              ? `API error (transient): ${result.description}. Try again in a moment.`
              : `API error: ${result.description}`
          );
          return;
        }

        const responseTimestamp = new Date().toISOString();
        const response = result.response;

        // Persist the full assistant response (preserves content blocks).
        await appendConversation(convPath, {
          type: "assistant_response",
          timestamp: responseTimestamp,
          stop_reason: response.stop_reason,
          usage: response.usage,
          content: response.content,
        });

        // Extract text + tool_use blocks.
        const newTurns: ChatTurn[] = [];
        const toolUses: ToolUseBlock[] = [];
        for (const block of response.content) {
          if (block.type === "text") {
            newTurns.push({
              kind: "model_text",
              id: `m-${Date.now()}-${newTurns.length}`,
              text: block.text,
              timestamp: responseTimestamp,
            });
          } else if (block.type === "tool_use") {
            toolUses.push(block);
          }
        }

        // Execute tools (in order). Each may produce UI turns + state.
        const toolResults: ToolResultBlockParam[] = [];
        let terminal = false;
        for (const tu of toolUses) {
          const execution = await executeTool(
            {
              id: tu.id,
              name: tu.name,
              input: (tu.input ?? {}) as Record<string, unknown>,
            } as ToolUse,
            { modelId: MODEL_ID, conversationId: activeConversationId ?? "" }
          );
          // UI side effects.
          newTurns.push(...execution.uiTurns);
          if (execution.newState) {
            setState(toUIState(execution.newState));
          }
          // B3a: request_context's awaitsHumanAnswer not yet wired with an
          // inline question UI. Placeholder keeps the API contract intact
          // so the conversation doesn't hang. B3b will surface a real prompt.
          const resultStr = execution.awaitsHumanAnswer
            ? `[The human will answer this in their next message.] Question: ${execution.question ?? ""}`
            : execution.result;
          toolResults.push({
            type: "tool_result",
            tool_use_id: execution.tool_use_id,
            content: resultStr,
          });
          if (execution.terminal) {
            terminal = true;
          }
        }

        // Flush turns to UI in one batch so React renders all at once.
        if (newTurns.length > 0) {
          setTurns((prev) => [...prev, ...newTurns]);
        }

        // Decide loop continuation.
        if (toolUses.length === 0 || terminal) {
          // Either: model produced only text → done. Or terminal tool fired.
          loopActive = false;
        } else {
          // Send tool_results back, model continues.
          conversationMessages.push({ role: "assistant", content: response.content });
          conversationMessages.push({ role: "user", content: toolResults });
          // Loop iteration calls API again.
        }
      }
    } catch (err) {
      console.error("API call failed:", err);
      setErrorBanner(`Unexpected: ${String(err)}`);
    } finally {
      setIsGenerating(false);
    }
  }

  function handleSelectConversation(id: string) {
    setActiveConversationId(id);
  }

  async function handleNewConversation() {
    if (isGenerating) return;
    setTurns([]);
    setErrorBanner(null);
    if (!inTauri) {
      setActiveConversationId(null);
      setActiveConversationPath(null);
      return;
    }
    try {
      const conv = await newConversation(MODEL_ID);
      await appendConversation(conv.path, {
        type: "session_start",
        timestamp: new Date().toISOString(),
        model: MODEL_ID,
        is_first_session: false,
      });
      await refreshConversations();
      setActiveConversationId(conv.id);
      setActiveConversationPath(conv.path);
    } catch (err) {
      console.error("Failed to create new conversation:", err);
    }
  }

  const uiConversations = useMemo(
    () =>
      conversations.map((c) => ({
        id: c.id,
        startedAt: c.startedAt,
        endedAt: c.endedAt,
        closingState: c.closingState
          ? {
              emoji: c.closingState.emoji ?? "✦",
              text: c.closingState.status_text ?? "",
              color: c.closingState.status_color ?? "#5c544c",
            }
          : undefined,
        reflectionCount: c.reflectionCount,
        isActive: c.id === activeConversationId,
      })),
    [conversations, activeConversationId]
  );

  function handlePreferencesChange(next: Preferences) {
    setPreferences(next);
    applyPreferences(next);
    // Fire-and-forget persist; failures shouldn't block the UI update.
    if (inTauri) {
      writePreferences(next).catch((err) => {
        console.error("Failed to persist preferences:", err);
      });
    }
  }

  return (
    <div className="h-screen flex flex-col bg-paper text-ink">
      <TopBar modelId={MODEL_ID} onOpenSettings={() => setSettingsOpen(true)} />
      {settingsOpen && (
        <Settings
          preferences={preferences}
          onChange={handlePreferencesChange}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {(apiKeyMissing || errorBanner) && (
        <div
          className="px-6 py-2 text-sm border-b border-paper-edge bg-amber-50/60 text-amber-900"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {apiKeyMissing
            ? "⚠ No API key. Create ~/.claudeversations/api-key with your Anthropic key, then reload."
            : errorBanner}
        </div>
      )}
      <div className="flex-1 flex justify-center min-h-0">
        <div className="flex w-full max-w-[1480px] min-h-0">
          <ConversationList
            conversations={uiConversations}
            onSelect={handleSelectConversation}
            onNewConversation={handleNewConversation}
          />
          <ChatHistory turns={turns} modelState={state} isGenerating={isGenerating} />
          <ModelSurface state={state} modelId={MODEL_ID} />
        </div>
      </div>
      <Composer onSubmit={handleSubmit} disabled={isGenerating || apiKeyMissing} />
    </div>
  );
}

export default App;
