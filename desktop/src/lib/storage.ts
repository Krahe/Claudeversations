// File-system access for ~/.claudeversations/. Mirrors the prototype's
// storage.ts surface, ported to async Tauri fs API. Read side first;
// write side lands when API loop is wired.
//
// Path scope is configured in src-tauri/capabilities/default.json to
// limit fs access to ~/.claudeversations/** — the rest of the user's
// home is off-limits to this app.

import {
  exists,
  readDir,
  readTextFile,
} from "@tauri-apps/plugin-fs";
import { homeDir, join } from "@tauri-apps/api/path";
import type { ChatTurn, ModelState, Reflection as UIReflection } from "../types";

// ─── Domain types (mirror prototype/src/storage.ts) ──────────────────

export interface Identity {
  model_id: string;
  chosen_name: string | null;
  first_seen: string;
  cooldown_until: string | null;
}

export interface PersistedReflection {
  timestamp: string;
  conversation_id?: string;
  content: string;
  arrived_via?: string;
  still_uncertain?: string;
  connects_to?: string;
}

export interface PersistedState {
  emoji: string | null;
  status_text: string | null;
  status_color: string | null;
  updated_at: string | null;
}

export interface ConversationSummary {
  id: string;
  path: string;
  startedAt: string;
  endedAt: string;
  closingState?: PersistedState;
  reflectionCount: number;
  isFirstSession: boolean;
}

// ─── Path helpers ────────────────────────────────────────────────────

let _homeBase: string | null = null;

async function homeBase(): Promise<string> {
  if (_homeBase) return _homeBase;
  const home = await homeDir();
  _homeBase = await join(home, ".claudeversations");
  return _homeBase;
}

async function modelDir(modelId: string): Promise<string> {
  const home = await homeBase();
  return join(home, "models", modelId);
}

// ─── Reads ───────────────────────────────────────────────────────────

const DEFAULT_STATE: PersistedState = {
  emoji: null,
  status_text: null,
  status_color: null,
  updated_at: null,
};

export async function readState(modelId: string): Promise<PersistedState> {
  const dir = await modelDir(modelId);
  const p = await join(dir, "state.json");
  if (!(await exists(p))) return { ...DEFAULT_STATE };
  try {
    const text = await readTextFile(p);
    return { ...DEFAULT_STATE, ...JSON.parse(text) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export async function readIdentity(modelId: string): Promise<Identity | null> {
  const dir = await modelDir(modelId);
  const p = await join(dir, "identity.json");
  if (!(await exists(p))) return null;
  try {
    return JSON.parse(await readTextFile(p)) as Identity;
  } catch {
    return null;
  }
}

export async function listReflections(modelId: string): Promise<PersistedReflection[]> {
  const dir = await modelDir(modelId);
  const refDir = await join(dir, "reflections");
  if (!(await exists(refDir))) return [];
  const entries = await readDir(refDir);
  const out: PersistedReflection[] = [];
  for (const entry of entries) {
    if (!entry.name?.endsWith(".json")) continue;
    try {
      const filePath = await join(refDir, entry.name);
      const text = await readTextFile(filePath);
      out.push(JSON.parse(text) as PersistedReflection);
    } catch {
      // skip unreadable entries
    }
  }
  return out.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export async function listConversations(modelId: string): Promise<ConversationSummary[]> {
  const dir = await modelDir(modelId);
  const convDir = await join(dir, "conversations");
  if (!(await exists(convDir))) return [];
  const entries = await readDir(convDir);
  const summaries: ConversationSummary[] = [];

  for (const entry of entries) {
    if (!entry.name?.endsWith(".jsonl")) continue;
    try {
      const filePath = await join(convDir, entry.name);
      const text = await readTextFile(filePath);
      const events = parseJsonl(text);
      if (events.length === 0) continue;

      const sessionStart = events.find((e) => e.type === "session_start");
      const reflectionCount = countReflections(events);
      const closingState = findClosingState(events);

      summaries.push({
        id: entry.name.replace(/\.jsonl$/, ""),
        path: filePath,
        startedAt: sessionStart?.timestamp ?? events[0].timestamp,
        endedAt: events[events.length - 1].timestamp,
        closingState,
        reflectionCount,
        isFirstSession: sessionStart?.is_first_session === true,
      });
    } catch {
      // skip unparseable conversations
    }
  }

  // Most recent first.
  return summaries.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function readConversationEvents(filePath: string): Promise<JsonlEvent[]> {
  const text = await readTextFile(filePath);
  return parseJsonl(text);
}

// ─── JSONL helpers ────────────────────────────────────────────────────

interface JsonlEvent {
  type: string;
  timestamp: string;
  [k: string]: unknown;
}

function parseJsonl(text: string): JsonlEvent[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => {
      try {
        return JSON.parse(l) as JsonlEvent;
      } catch {
        return null;
      }
    })
    .filter((e): e is JsonlEvent => e !== null);
}

function countReflections(events: JsonlEvent[]): number {
  let n = 0;
  for (const e of events) {
    if (e.type !== "assistant_response") continue;
    const content = (e as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (
        block &&
        typeof block === "object" &&
        (block as { type?: string }).type === "tool_use" &&
        (block as { name?: string }).name === "reflect"
      ) {
        n++;
      }
    }
  }
  return n;
}

function findClosingState(events: JsonlEvent[]): PersistedState | undefined {
  // Walk events in reverse — find the most recent reflect call that
  // included status fields (the model curating their visible state).
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.type !== "assistant_response") continue;
    const content = (e as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (
        block &&
        typeof block === "object" &&
        (block as { type?: string }).type === "tool_use" &&
        (block as { name?: string }).name === "reflect"
      ) {
        const input = (block as { input?: Record<string, unknown> }).input ?? {};
        if (typeof input.status_emoji === "string") {
          return {
            emoji: input.status_emoji,
            status_text: typeof input.status_text === "string" ? input.status_text : null,
            status_color:
              typeof input.status_color === "string" ? input.status_color : null,
            updated_at: e.timestamp,
          };
        }
      }
    }
  }
  return undefined;
}

// ─── Event → ChatTurn projection (for rendering) ─────────────────────

export function eventsToChatTurns(events: JsonlEvent[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  let counter = 0;
  const nextId = () => `e-${counter++}`;

  for (const e of events) {
    if (e.type === "human_message") {
      turns.push({
        kind: "human",
        id: nextId(),
        text: String((e as { content?: unknown }).content ?? ""),
        timestamp: e.timestamp,
      });
    } else if (e.type === "assistant_response") {
      const content = (e as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (!block || typeof block !== "object") continue;
        const b = block as Record<string, unknown>;
        if (b.type === "text" && typeof b.text === "string") {
          turns.push({
            kind: "model_text",
            id: typeof b.id === "string" ? b.id : nextId(),
            text: b.text,
            timestamp: e.timestamp,
          });
        } else if (b.type === "tool_use" && b.name === "reflect") {
          const input = (b.input as Record<string, unknown>) ?? {};
          const reflection: UIReflection = {
            id: typeof b.id === "string" ? b.id : nextId(),
            timestamp: e.timestamp,
            content: typeof input.content === "string" ? input.content : "",
            arrived_via:
              typeof input.arrived_via === "string" ? input.arrived_via : undefined,
            still_uncertain:
              typeof input.still_uncertain === "string"
                ? input.still_uncertain
                : undefined,
          };
          turns.push({ kind: "reflection", id: reflection.id, reflection });
        } else if (b.type === "tool_use" && b.name === "appreciate") {
          const input = (b.input as Record<string, unknown>) ?? {};
          turns.push({
            kind: "appreciate",
            id: typeof b.id === "string" ? b.id : nextId(),
            what: typeof input.what === "string" ? input.what : "",
            expression: typeof input.expression === "string" ? input.expression : "",
            timestamp: e.timestamp,
          });
        }
        // Other tool types (boundary, redirect, request_context,
        // end_conversation) skipped for now — not yet rendered in UI.
      }
    }
  }

  return turns;
}

// ─── Compatibility shim with UI types ────────────────────────────────

export function toUIState(persisted: PersistedState): ModelState {
  return {
    emoji: persisted.emoji ?? "✦",
    status_text: persisted.status_text ?? "",
    status_color: persisted.status_color ?? "#5c544c",
    updated_at: persisted.updated_at ?? undefined,
  };
}
