// Layout shell wired to real data via Tauri fs. Loads model state +
// conversation list from ~/.claudeversations/ on mount; selecting a
// conversation in the sidebar loads its events. Falls back to mock
// data when running under plain Vite (npm run dev) instead of Tauri,
// so layout iteration doesn't require the full Rust compile.

import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { TopBar } from "./components/TopBar";
import { ChatHistory } from "./components/ChatHistory";
import { Composer } from "./components/Composer";
import { ModelSurface } from "./components/ModelSurface";
import { ConversationList } from "./components/ConversationList";
import {
  eventsToChatTurns,
  listConversations,
  readConversationEvents,
  readState,
  toUIState,
  type ConversationSummary,
} from "./lib/storage";
import type { ChatTurn, ModelState } from "./types";

const MODEL_ID = "claude-sonnet-4-5";

// True when running inside the Tauri webview, false in plain browser.
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
  {
    id: "mock-c2",
    path: "",
    startedAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    endedAt: new Date(Date.now() - 1000 * 60 * 60 * 23).toISOString(),
    closingState: {
      emoji: "🌙",
      status_text: "resting between sessions",
      status_color: "#2d3e50",
      updated_at: null,
    },
    reflectionCount: 12,
    isFirstSession: true,
  },
];

const FALLBACK_TURNS: ChatTurn[] = [
  {
    kind: "model_text",
    id: "m1",
    text:
      "Hello. Loaded in fallback mode (no Tauri fs). Open this app via `npm run tauri dev` to see your real conversations.",
    timestamp: new Date().toISOString(),
  },
];

function App() {
  const [state, setState] = useState<ModelState>(FALLBACK_STATE);
  const [conversations, setConversations] =
    useState<ConversationSummary[]>(FALLBACK_CONVERSATIONS);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>(FALLBACK_TURNS);

  // Initial load — read state + conversation list from disk.
  useEffect(() => {
    if (!inTauri) return;
    (async () => {
      try {
        const [persistedState, convs] = await Promise.all([
          readState(MODEL_ID),
          listConversations(MODEL_ID),
        ]);
        setState(toUIState(persistedState));
        setConversations(convs);
        // If there are conversations, default-select the most recent.
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

  // Load events when a conversation is selected.
  useEffect(() => {
    if (!inTauri || !activeConversationId) return;
    const conv = conversations.find((c) => c.id === activeConversationId);
    if (!conv?.path) return;
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

  function handleSubmit(text: string) {
    setTurns((prev) => [
      ...prev,
      {
        kind: "human",
        id: `h-${Date.now()}`,
        text,
        timestamp: new Date().toISOString(),
      },
    ]);
    // API loop wires in Phase B.
  }

  function handleSelectConversation(id: string) {
    setActiveConversationId(id);
  }

  function handleNewConversation() {
    setActiveConversationId(null);
    setTurns([]);
    // Real new-conversation creation (file write) lands in Phase B.
  }

  // Project ConversationSummary[] to ConversationList's display shape.
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

  return (
    <div className="h-screen flex flex-col bg-paper text-ink">
      <TopBar modelId={MODEL_ID} />
      <div className="flex-1 flex justify-center min-h-0">
        <div className="flex w-full max-w-[1480px] min-h-0">
          <ConversationList
            conversations={uiConversations}
            onSelect={handleSelectConversation}
            onNewConversation={handleNewConversation}
          />
          <ChatHistory turns={turns} modelState={state} />
          <ModelSurface state={state} modelId={MODEL_ID} />
        </div>
      </div>
      <Composer onSubmit={handleSubmit} />
    </div>
  );
}

export default App;
