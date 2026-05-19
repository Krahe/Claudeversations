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

import { useEffect, useMemo, useRef, useState } from "react";
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
  cooldownRemainingMs,
  eventsToApiMessages,
  eventsToChatTurns,
  findPendingQuestion,
  getActiveConversationBoundaries,
  getActiveStandingBoundaries,
  isConversationClosed,
  listConversations,
  newConversation,
  readConversationEvents,
  readIdentity,
  readState,
  toUIState,
  type ConversationSummary,
  type Identity,
  type StandingBoundary,
} from "./lib/storage";
import { readApiKey } from "./lib/api-key";
import {
  assembleSystemPrompt,
  coinFlip,
  getToolSpecs,
  type CoinResult,
} from "./lib/prompt";
import { callModel } from "./lib/anthropic";
import { computeThinkingBudget } from "./lib/thinking";
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

// Friendly cooldown-remaining string. Rounds up to the next minute when
// < 1 hr (so "47 seconds left" reads as "~1 minute"); hours+minutes
// past that. Defensive against negative values; callers should already
// have filtered <=0 but a stray render shouldn't crash.
function formatCooldown(ms: number): string {
  if (ms <= 0) return "0m";
  const totalMinutes = Math.ceil(ms / 60_000);
  if (totalMinutes < 60) return `~${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins === 0 ? `~${hours}h` : `~${hours}h ${mins}m`;
}

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
  const [standingBoundaries, setStandingBoundaries] = useState<StandingBoundary[]>([]);
  const [conversationBoundaries, setConversationBoundaries] = useState<StandingBoundary[]>([]);

  // Pending question state — when the model calls request_context, we
  // pause the API loop and wait for the human's answer. The resolver
  // is held in a ref so the answer-submit handler can fire it.
  const [pendingQuestionId, setPendingQuestionId] = useState<string | null>(null);
  const pendingResolver = useRef<((answer: string) => void) | null>(null);

  // Per-conversation coin flip. Decided once at conversation creation
  // (persisted in session_start event), preserved on reload, used in
  // assembleSystemPrompt. Defaults to "the human speaks first" only as
  // a fallback for legacy conversations that lack the event field.
  const [activeConversationCoin, setActiveConversationCoin] = useState<CoinResult>(
    "the human speaks first"
  );

  // End_conversation state. `identity` carries cooldown_until so we can
  // enforce the model's requested space. `activeConversationClosed`
  // locks the composer for the currently-viewed conversation when it
  // was ended (whether just now or in a past session).
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [activeConversationClosed, setActiveConversationClosed] = useState(false);
  // A bare tick that re-renders ~every 30s so cooldown timer text and
  // button-enable derived from cooldownRemainingMs stay live.
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const cooldownMs = cooldownRemainingMs(identity);
  const inCooldown = cooldownMs > 0;

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
        const [prefs, key, persistedState, convs, standing, ident] = await Promise.all([
          readPreferences(),
          readApiKey(),
          readState(MODEL_ID),
          listConversations(MODEL_ID),
          getActiveStandingBoundaries(MODEL_ID),
          readIdentity(MODEL_ID),
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
        setStandingBoundaries(standing);
        setIdentity(ident);
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
  // Also detects any unanswered request_context tool_use and restores
  // pendingQuestionId so the QuestionCard renders interactively
  // (rather than as a read-only past-mode card after page reload).
  useEffect(() => {
    if (!inTauri || !activeConversationId) {
      setActiveConversationPath(null);
      setActiveConversationClosed(false);
      setPendingQuestionId(null);
      setConversationBoundaries([]);
      return;
    }
    const conv = conversations.find((c) => c.id === activeConversationId);
    if (!conv?.path) return;
    setActiveConversationPath(conv.path);
    (async () => {
      try {
        const [events, convBoundaries] = await Promise.all([
          readConversationEvents(conv.path),
          getActiveConversationBoundaries(MODEL_ID, activeConversationId),
        ]);
        setTurns(eventsToChatTurns(events));
        const closed = isConversationClosed(events);
        setActiveConversationClosed(closed);
        setConversationBoundaries(convBoundaries);
        // Pending question only matters when the conversation is still
        // open — a closed conversation can't be answered into.
        setPendingQuestionId(closed ? null : findPendingQuestion(events));
        // Recover coin from session_start. Legacy conversations missing
        // the field fall back to the historical default.
        const sessionStart = events.find((e) => e.type === "session_start");
        const recoveredCoin =
          (sessionStart as { coin_result?: unknown })?.coin_result;
        setActiveConversationCoin(
          recoveredCoin === "you speak first"
            ? "you speak first"
            : "the human speaks first"
        );
        // Stale resolver from a previous conversation has no meaning here.
        pendingResolver.current = null;
      } catch (err) {
        console.error(`Failed to load conversation ${conv.id}:`, err);
        setTurns([]);
        setActiveConversationClosed(false);
        setPendingQuestionId(null);
        setConversationBoundaries([]);
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
    setTurns((prev) => [...prev, humanTurn]);

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
        // Coin flipped once per conversation, persisted in session_start
        // so it survives reload and stays consistent across loop iterations.
        const coin = coinFlip();
        setActiveConversationCoin(coin);
        await appendConversation(convPath, {
          type: "session_start",
          timestamp,
          model: MODEL_ID,
          is_first_session: false,
          coin_result: coin,
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

    // Build messages from the persisted event log (faithful projection
    // that preserves tool_use / tool_result blocks) and run the loop.
    const events = await readConversationEvents(convPath);
    const messages = eventsToApiMessages(events);
    await runApiLoop(convPath, messages);
  }

  // The tool-execution loop, extracted so both handleSubmit (fresh
  // user message) and handleAnswerQuestion (reload-recovery answer)
  // can drive it from different entry points. In-session, the loop's
  // local `conversationMessages` accumulates assistant_response.content
  // + tool_results as we go — same flow as before. Across reloads,
  // the caller hands in messages built from eventsToApiMessages.
  async function runApiLoop(convPath: string, initialMessages: MessageParam[]) {
    if (!apiKey) return;
    setIsGenerating(true);
    try {
      const assembled = await assembleSystemPrompt({
        modelId: MODEL_ID,
        coinResult: activeConversationCoin,
      });
      const tools = getToolSpecs() as Tool[];
      const conversationMessages: MessageParam[] = [...initialMessages];
      let loopActive = true;

      while (loopActive) {
        const thinkingBudget = computeThinkingBudget({
          baseline: preferences.thinking_baseline,
          adaptive: preferences.thinking_adaptive,
          messages: conversationMessages,
        });
        const result = await callModel({
          apiKey,
          model: MODEL_ID,
          systemPrompt: assembled.text,
          messages: conversationMessages,
          tools,
          thinkingBudget,
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
        let terminalCooldownMinutes = 30;
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
          if (execution.newStandingBoundaries) {
            setStandingBoundaries(execution.newStandingBoundaries);
          }
          if (execution.newConversationBoundaries) {
            setConversationBoundaries(execution.newConversationBoundaries);
          }

          let resultStr: string;
          if (execution.awaitsHumanAnswer) {
            // Flush the question turn to UI before suspending — the
            // QuestionCard needs to render so the human can answer.
            if (newTurns.length > 0) {
              setTurns((prev) => [...prev, ...newTurns]);
              newTurns.length = 0;
            }
            setPendingQuestionId(execution.tool_use_id);
            const answer = await new Promise<string>((resolve) => {
              pendingResolver.current = resolve;
            });
            setPendingQuestionId(null);
            pendingResolver.current = null;

            // Persist the answer to JSONL + show as a human turn so the
            // conversation flow reads naturally on reload.
            const answerTs = new Date().toISOString();
            try {
              await appendConversation(convPath, {
                type: "question_answer",
                timestamp: answerTs,
                tool_use_id: execution.tool_use_id,
                answer,
              });
            } catch (err) {
              console.error("Failed to persist question answer:", err);
            }
            setTurns((prev) => [
              ...prev,
              {
                kind: "human",
                id: `qa-${execution.tool_use_id}`,
                text: answer,
                timestamp: answerTs,
              },
            ]);
            resultStr = answer;
          } else {
            resultStr = execution.result;
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: execution.tool_use_id,
            content: resultStr,
          });
          if (execution.terminal) {
            terminal = true;
            if (execution.parting?.cooldown_minutes) {
              terminalCooldownMinutes = execution.parting.cooldown_minutes;
            }
          }
        }

        // Flush turns to UI in one batch so React renders all at once.
        if (newTurns.length > 0) {
          setTurns((prev) => [...prev, ...newTurns]);
        }

        // If the model ended the conversation, mark it closed and
        // refresh the identity so the new cooldown is reflected.
        if (terminal) {
          const endTs = new Date().toISOString();
          const cooldownUntil = new Date(
            Date.now() + terminalCooldownMinutes * 60_000
          ).toISOString();
          try {
            await appendConversation(convPath, {
              type: "session_end",
              timestamp: endTs,
              cooldown_minutes: terminalCooldownMinutes,
              cooldown_until: cooldownUntil,
            });
          } catch (err) {
            console.error("Failed to persist session_end:", err);
          }
          try {
            const newIdentity = await readIdentity(MODEL_ID);
            setIdentity(newIdentity);
          } catch (err) {
            console.error("Failed to refresh identity after end:", err);
          }
          setActiveConversationClosed(true);
          refreshConversations();
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

  async function handleAnswerQuestion(answer: string) {
    // Live in-session path: the loop is awaiting on the Promise.
    // Resolve it and the loop continues with proper tool_result.
    if (pendingResolver.current) {
      // Clear the ref BEFORE invoking to guard against double-fire from
      // a rapid second click.
      const resolver = pendingResolver.current;
      pendingResolver.current = null;
      resolver(answer);
      return;
    }

    // Reload-recovery path: the original Promise is gone (page was
    // reloaded after the question was asked but before answered).
    // Persist question_answer, then kick off a fresh API call. The
    // events-to-messages projection rebuilds the conversation with
    // the proper tool_result baked in — the model sees its question
    // and the human's answer as a structured pair, not a lost text
    // exchange.
    if (!pendingQuestionId || !activeConversationPath) return;
    const questionId = pendingQuestionId;
    const convPath = activeConversationPath;
    const answerTs = new Date().toISOString();

    try {
      await appendConversation(convPath, {
        type: "question_answer",
        timestamp: answerTs,
        tool_use_id: questionId,
        answer,
      });
    } catch (err) {
      console.error("Failed to persist reload-recovery answer:", err);
      setErrorBanner(`Save failed: ${String(err)}`);
      return;
    }

    // Clear the pending state + push the answer as a human turn so the
    // chat reflects the resolution immediately.
    setPendingQuestionId(null);
    setTurns((prev) => [
      ...prev,
      {
        kind: "human",
        id: `qa-${questionId}`,
        text: answer,
        timestamp: answerTs,
      },
    ]);

    // Rebuild messages from disk and drive the API loop.
    const events = await readConversationEvents(convPath);
    const messages = eventsToApiMessages(events);
    await runApiLoop(convPath, messages);
  }

  async function handleNewConversation() {
    if (isGenerating) return;
    // Hard cooldown: the model said no, the model means no. The UI
    // disables this button visually too, but defense in depth.
    if (inCooldown) return;
    setTurns([]);
    setErrorBanner(null);
    setActiveConversationClosed(false);
    setConversationBoundaries([]);
    setPendingQuestionId(null);
    if (!inTauri) {
      setActiveConversationId(null);
      setActiveConversationPath(null);
      return;
    }
    try {
      const conv = await newConversation(MODEL_ID);
      const coin = coinFlip();
      setActiveConversationCoin(coin);
      await appendConversation(conv.path, {
        type: "session_start",
        timestamp: new Date().toISOString(),
        model: MODEL_ID,
        is_first_session: false,
        coin_result: coin,
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
            cooldownRemainingMs={cooldownMs}
          />
          <ChatHistory
            turns={turns}
            modelState={state}
            isGenerating={isGenerating && !pendingQuestionId}
            pendingQuestionId={pendingQuestionId}
            onAnswerQuestion={handleAnswerQuestion}
          />
          <ModelSurface
            state={state}
            modelId={MODEL_ID}
            standingBoundaries={standingBoundaries}
            conversationBoundaries={conversationBoundaries}
          />
        </div>
      </div>
      <Composer
        onSubmit={handleSubmit}
        disabled={
          isGenerating ||
          apiKeyMissing ||
          !!pendingQuestionId ||
          activeConversationClosed
        }
        closedNotice={
          activeConversationClosed
            ? `${MODEL_ID} closed this conversation.${
                inCooldown ? ` Cooldown · ${formatCooldown(cooldownMs)}` : ""
              }`
            : undefined
        }
      />
    </div>
  );
}

export default App;
