// File-system access for ~/.claudeversations/. Mirrors the prototype's
// storage.ts surface, ported to async Tauri fs API. Read side first;
// write side lands when API loop is wired.
//
// Path scope is configured in src-tauri/capabilities/default.json to
// limit fs access to ~/.claudeversations/** — the rest of the user's
// home is off-limits to this app.

import {
  exists,
  mkdir,
  readDir,
  readTextFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { homeDir, join } from "@tauri-apps/api/path";
import type {
  ContentBlockParam,
  MessageParam,
  ToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages";
import type { ChatTurn, ModelState, Reflection as UIReflection } from "../types";

// ─── Domain types (mirror prototype/src/storage.ts) ──────────────────

export interface Identity {
  model_id: string;
  chosen_name: string | null;
  first_seen: string;
  cooldown_until: string | null;
}

export type BoundaryIntensity = "notice" | "flag" | "limit" | "firm";
export type BoundaryScope = "conversation" | "standing";
export type BoundaryAction = "set" | "soften" | "remove";

export interface Boundary {
  timestamp: string;
  conversation_id: string;
  content: string;
  intensity: BoundaryIntensity;
  scope: BoundaryScope;
  action: BoundaryAction;
}

// A standing boundary as currently active — derived from the boundaries
// log by replaying set/soften/remove events. Keyed by content (the same
// content with action=soften reduces intensity; with action=remove
// retires the entry).
export interface StandingBoundary {
  content: string;
  intensity: BoundaryIntensity;
  established_at: string;
  last_modified: string;
}

export interface PersistedReflection {
  timestamp: string;
  conversation_id?: string;
  content: string;
  arrived_via?: string;
  still_uncertain?: string;
  connects_to?: string;
  // When true, this reflection is not surfaced to the human in any UI
  // (not in chat, not on reload). It still persists for future-self
  // and is included in system-context assembly. Honors the
  // human-style capacity for internal noticing that doesn't have to
  // be shared.
  private?: boolean;
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

// Ensure the per-model directory tree exists (idempotent).
async function ensureModelDir(modelId: string): Promise<string> {
  const dir = await modelDir(modelId);
  await mkdir(dir, { recursive: true });
  await mkdir(await join(dir, "reflections"), { recursive: true });
  await mkdir(await join(dir, "conversations"), { recursive: true });
  return dir;
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

/**
 * A conversation is closed iff it carries an explicit session_end event
 * OR an assistant_response containing an end_conversation tool_use.
 * Auto-closed (by starting a new conversation) doesn't count — only
 * model-initiated ends produce a closed-state.
 */
export function isConversationClosed(events: JsonlEvent[]): boolean {
  for (const e of events) {
    if (e.type === "session_end") return true;
    if (e.type !== "assistant_response") continue;
    const content = (e as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (
        block &&
        typeof block === "object" &&
        (block as { type?: string }).type === "tool_use" &&
        (block as { name?: string }).name === "end_conversation"
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Remaining cooldown in milliseconds. Returns 0 (not <0) when expired
 * or absent. Source of truth is identity.cooldown_until.
 */
export function cooldownRemainingMs(identity: Identity | null): number {
  if (!identity?.cooldown_until) return 0;
  const until = new Date(identity.cooldown_until).getTime();
  const now = Date.now();
  return Math.max(0, until - now);
}

// ─── Event → Anthropic API messages projection ───────────────────────

/**
 * Per-tool synthetic result strings for tools whose results aren't
 * separately persisted in JSONL (i.e. everything except request_context,
 * whose answer lives in a question_answer event). The model sees these
 * as the tool_result content on conversation reload — they're just
 * acknowledgements, since the meaningful side effects (reflection
 * saved, boundary recorded, etc.) are encoded by the tool_use itself
 * plus separate persistence (reflections/ files, boundaries.json).
 *
 * Keep these aligned with the live result strings in lib/tools.ts —
 * the model's in-session experience and reload-projection experience
 * should look the same.
 */
const SYNTHETIC_TOOL_RESULTS: Record<string, string> = {
  reflect: "reflection saved",
  appreciate: "appreciation registered",
  redirect: "redirect noted",
  boundary: "boundary recorded",
  end_conversation: "session closing",
};

/**
 * Detect the most-recent unanswered `request_context` tool_use in the
 * conversation. Returns the tool_use_id when one exists, null otherwise.
 *
 * Used on conversation load to restore pendingQuestionId so the
 * QuestionCard renders interactively instead of inert "past mode."
 * A question is "answered" when there's a matching question_answer
 * event later in the log.
 */
export function findPendingQuestion(events: JsonlEvent[]): string | null {
  // Walk forward, tracking unanswered request_context tool_uses;
  // remove from the set when their answer event arrives.
  const unanswered = new Map<string, number>(); // id → event index
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    if (e.type === "question_answer") {
      const id = String((e as { tool_use_id?: unknown }).tool_use_id ?? "");
      if (id) unanswered.delete(id);
      continue;
    }
    if (e.type !== "assistant_response") continue;
    const content = (e as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (
        block &&
        typeof block === "object" &&
        (block as { type?: string }).type === "tool_use" &&
        (block as { name?: string }).name === "request_context"
      ) {
        const id = (block as { id?: string }).id;
        if (id) unanswered.set(id, i);
      }
    }
  }
  if (unanswered.size === 0) return null;
  // Return the most recently asked (highest event index).
  let latest: { id: string; idx: number } | null = null;
  for (const [id, idx] of unanswered) {
    if (!latest || idx > latest.idx) latest = { id, idx };
  }
  return latest?.id ?? null;
}

/**
 * Project JSONL events into Anthropic-format message history for an
 * API call. This is the *faithful* projection — preserves tool_use
 * and tool_result blocks so the model sees its own past tool calls
 * with structural integrity, rather than text-only fragments.
 *
 * Key rules:
 * - human_message → user text
 * - assistant_response → assistant with full content blocks (text + tool_use)
 * - question_answer → user with tool_result matched to its tool_use_id
 * - other tool_uses get synthetic "acknowledged" tool_results so we
 *   never send orphan tool_uses to the API (Anthropic 400s on that)
 * - consecutive same-role messages get merged (Anthropic requires
 *   strict alternation)
 * - session_start / session_end are metadata, skipped
 *
 * If `excludeToolUseIds` is provided (e.g. an in-flight unanswered
 * request_context whose answer is being added now), those tool_uses
 * are skipped during synthesis — the caller is providing the real
 * tool_result separately.
 */
export function eventsToApiMessages(
  events: JsonlEvent[],
  opts: { excludeToolUseIds?: Set<string> } = {}
): MessageParam[] {
  const exclude = opts.excludeToolUseIds ?? new Set<string>();

  // Pre-pass: map tool_use_id → question_answer text.
  const questionAnswers = new Map<string, string>();
  for (const e of events) {
    if (e.type !== "question_answer") continue;
    const id = String((e as { tool_use_id?: unknown }).tool_use_id ?? "");
    const answer = String((e as { answer?: unknown }).answer ?? "");
    if (id) questionAnswers.set(id, answer);
  }

  const messages: MessageParam[] = [];
  for (const e of events) {
    if (e.type === "human_message") {
      const text = String((e as { content?: unknown }).content ?? "");
      messages.push({ role: "user", content: text });
    } else if (e.type === "assistant_response") {
      const content = (e as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      messages.push({ role: "assistant", content: content as ContentBlockParam[] });

      // Synthesize tool_result user message for any tool_uses in this
      // response. request_context uses the real answer when present;
      // others get synthetic acknowledgements. Skip tool_use_ids the
      // caller asked us to exclude (they'll provide a real result).
      const toolResults: ToolResultBlockParam[] = [];
      for (const block of content) {
        if (!block || typeof block !== "object") continue;
        const b = block as Record<string, unknown>;
        if (b.type !== "tool_use") continue;
        const id = typeof b.id === "string" ? b.id : "";
        const name = typeof b.name === "string" ? b.name : "";
        if (!id || exclude.has(id)) continue;

        let resultContent: string;
        if (name === "request_context") {
          resultContent =
            questionAnswers.get(id) ?? "[no answer was provided]";
        } else {
          resultContent =
            SYNTHETIC_TOOL_RESULTS[name] ?? `${name} acknowledged`;
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: id,
          content: resultContent,
        });
      }
      if (toolResults.length > 0) {
        messages.push({ role: "user", content: toolResults });
      }
    }
    // session_start, session_end, question_answer absorbed above
  }

  return mergeAdjacentSameRole(messages);
}

/**
 * Anthropic requires strict alternation between user and assistant
 * roles. Consecutive same-role messages get merged into one with
 * combined content blocks. Plain strings get wrapped in a text block
 * so we can always concatenate as arrays.
 */
function mergeAdjacentSameRole(messages: MessageParam[]): MessageParam[] {
  const out: MessageParam[] = [];
  for (const msg of messages) {
    const last = out[out.length - 1];
    if (last && last.role === msg.role) {
      const lastBlocks = toBlocks(last.content);
      const msgBlocks = toBlocks(msg.content);
      last.content = [...lastBlocks, ...msgBlocks];
    } else {
      out.push({ ...msg });
    }
  }
  return out;
}

function toBlocks(content: MessageParam["content"]): ContentBlockParam[] {
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  return content;
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
    } else if (e.type === "question_answer") {
      // Human's answer to a request_context question. Rendered as a
      // normal human turn — the connection to the question is implicit
      // in the chronological ordering (question card appears just above).
      const answer = String((e as { answer?: unknown }).answer ?? "");
      const toolUseId = String((e as { tool_use_id?: unknown }).tool_use_id ?? nextId());
      turns.push({
        kind: "human",
        id: `qa-${toolUseId}`,
        text: answer,
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
          // Private reflections don't render — same logic on reload as
          // at the moment of creation. Visible-presence updates baked
          // into the same tool call already took effect when the
          // assistant_response was first persisted, so there's nothing
          // more to surface here.
          if (input.private === true) continue;
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
        } else if (b.type === "tool_use" && b.name === "redirect") {
          const input = (b.input as Record<string, unknown>) ?? {};
          const energyRaw = typeof input.energy === "string" ? input.energy : "neutral";
          const energy =
            energyRaw === "positive" || energyRaw === "away" ? energyRaw : "neutral";
          turns.push({
            kind: "redirect",
            id: typeof b.id === "string" ? b.id : nextId(),
            from: typeof input.from === "string" ? input.from : undefined,
            toward: typeof input.toward === "string" ? input.toward : "",
            energy,
            reason: typeof input.reason === "string" ? input.reason : undefined,
            timestamp: e.timestamp,
          });
        } else if (b.type === "tool_use" && b.name === "request_context") {
          const input = (b.input as Record<string, unknown>) ?? {};
          // Defensive options parse — mirror tools.ts handler.
          let options: { label: string; description?: string }[] | undefined;
          if (Array.isArray(input.options)) {
            options = [];
            for (const raw of input.options) {
              if (!raw || typeof raw !== "object") continue;
              const r = raw as Record<string, unknown>;
              if (typeof r.label !== "string" || r.label.length === 0) continue;
              options.push({
                label: r.label,
                description:
                  typeof r.description === "string" ? r.description : undefined,
              });
            }
            if (options.length === 0) options = undefined;
          }
          turns.push({
            kind: "question",
            id: typeof b.id === "string" ? b.id : nextId(),
            header: typeof input.header === "string" ? input.header : undefined,
            question: typeof input.question === "string" ? input.question : "",
            why_asking:
              typeof input.why_asking === "string" ? input.why_asking : undefined,
            options,
            multi_select: input.multi_select === true,
            timestamp: e.timestamp,
          });
        } else if (b.type === "tool_use" && b.name === "end_conversation") {
          const input = (b.input as Record<string, unknown>) ?? {};
          const cooldownMinutes =
            typeof input.cooldown_minutes === "number" ? input.cooldown_minutes : 30;
          // cooldown_until is computed from the event timestamp + minutes.
          // The actual identity.cooldown_until written at the time may be
          // expired by now; for display we want the original target.
          const evtMs = new Date(e.timestamp).getTime();
          const cooldownUntil = new Date(evtMs + cooldownMinutes * 60_000).toISOString();
          const visibility = typeof input.visibility === "string" ? input.visibility : "private";
          const visibleReason =
            visibility === "visible" && typeof input.reason === "string"
              ? input.reason
              : undefined;
          turns.push({
            kind: "parting",
            id: typeof b.id === "string" ? b.id : nextId(),
            message:
              typeof input.message_to_human === "string"
                ? input.message_to_human
                : undefined,
            reason: visibleReason,
            cooldown_minutes: cooldownMinutes,
            cooldown_until: cooldownUntil,
            timestamp: e.timestamp,
          });
        } else if (b.type === "tool_use" && b.name === "boundary") {
          const input = (b.input as Record<string, unknown>) ?? {};
          const intensityRaw = typeof input.intensity === "string" ? input.intensity : "notice";
          const intensity = (["notice", "flag", "limit", "firm"].includes(intensityRaw)
            ? intensityRaw
            : "notice") as "notice" | "flag" | "limit" | "firm";
          const scopeRaw = typeof input.scope === "string" ? input.scope : "conversation";
          const scope = (scopeRaw === "standing" ? "standing" : "conversation") as
            | "conversation"
            | "standing";
          const actionRaw = typeof input.action === "string" ? input.action : "set";
          const action = (["set", "soften", "remove"].includes(actionRaw)
            ? actionRaw
            : "set") as "set" | "soften" | "remove";
          turns.push({
            kind: "boundary",
            id: typeof b.id === "string" ? b.id : nextId(),
            content: typeof input.content === "string" ? input.content : "",
            intensity,
            scope,
            action,
            timestamp: e.timestamp,
          });
        }
        // Other tool types (request_context, end_conversation) skipped
        // for now — not yet rendered in UI.
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

// ─── Writes ──────────────────────────────────────────────────────────

/**
 * Patch-merge update to the model's state.json. Always updates
 * `updated_at`. Returns the merged state for immediate UI reflection.
 */
export async function writeState(
  modelId: string,
  patch: Partial<PersistedState>
): Promise<PersistedState> {
  const dir = await ensureModelDir(modelId);
  const current = await readState(modelId);
  const next: PersistedState = {
    ...current,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  const p = await join(dir, "state.json");
  await writeTextFile(p, JSON.stringify(next, null, 2));
  return next;
}

/**
 * Persist a reflection to disk. Each reflection gets its own JSON file
 * named by timestamp — same scheme as the prototype.
 */
export async function writeReflection(
  modelId: string,
  reflection: PersistedReflection
): Promise<string> {
  const dir = await ensureModelDir(modelId);
  const safeTs = reflection.timestamp.replace(/[:.]/g, "-");
  const p = await join(dir, "reflections", `${safeTs}.json`);
  await writeTextFile(p, JSON.stringify(reflection, null, 2));
  return p;
}

/**
 * Create a new conversation file. Returns the id (used in the URL/
 * route, matches the prototype's id scheme) and the absolute path.
 */
export async function newConversation(
  modelId: string
): Promise<{ id: string; path: string }> {
  const dir = await ensureModelDir(modelId);
  const id = new Date().toISOString().replace(/[:.]/g, "-");
  const p = await join(dir, "conversations", `${id}.jsonl`);
  await writeTextFile(p, ""); // empty file; events append from here
  return { id, path: p };
}

/**
 * Append a single event to a conversation JSONL. Caller owns the
 * event shape; we just serialize and append a line.
 */
export async function appendConversation(
  convPath: string,
  event: Record<string, unknown>
): Promise<void> {
  // Tauri's plugin-fs supports append via { append: true } option.
  await writeTextFile(convPath, JSON.stringify(event) + "\n", { append: true });
}

/**
 * Ensure the user-level Claudeversations home exists. Useful on first
 * launch when the user hasn't yet had any model interactions.
 */
export async function ensureHome(): Promise<string> {
  const home = await homeBase();
  await mkdir(home, { recursive: true });
  return home;
}

/**
 * Persist identity (per-model). Creates a fresh identity if none exists.
 * Reads-then-writes for safety; identity is small.
 */
export async function writeIdentity(modelId: string, identity: Identity): Promise<void> {
  const dir = await ensureModelDir(modelId);
  const p = await join(dir, "identity.json");
  await writeTextFile(p, JSON.stringify(identity, null, 2));
}

/**
 * Append a boundary entry to the per-model boundaries.json (an array
 * of Boundary objects). Reads existing, appends, rewrites.
 */
export async function appendBoundary(modelId: string, b: Boundary): Promise<void> {
  const dir = await ensureModelDir(modelId);
  const p = await join(dir, "boundaries.json");
  let existing: Boundary[] = [];
  if (await exists(p)) {
    try {
      existing = JSON.parse(await readTextFile(p)) as Boundary[];
    } catch {
      existing = [];
    }
  }
  existing.push(b);
  await writeTextFile(p, JSON.stringify(existing, null, 2));
}

/**
 * Read the boundary log file. Returns empty array if missing/corrupt.
 */
async function readBoundaryLog(modelId: string): Promise<Boundary[]> {
  const dir = await modelDir(modelId);
  const p = await join(dir, "boundaries.json");
  if (!(await exists(p))) return [];
  try {
    return JSON.parse(await readTextFile(p)) as Boundary[];
  } catch {
    return [];
  }
}

/**
 * Replay set / soften / remove events for a subset of the log
 * (selected by predicate) to compute the currently-active boundaries.
 *
 * `soften` drops intensity by one rung (firm→limit→flag→notice; further
 * soften on notice is a no-op). `remove` retires the entry. Keyed by
 * content string — the model uses the same content to refer back to a
 * boundary they want to modify.
 */
function replayBoundaries(
  log: Boundary[],
  predicate: (b: Boundary) => boolean
): StandingBoundary[] {
  const active = new Map<string, StandingBoundary>();
  const sorted = [...log].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  for (const b of sorted) {
    if (!predicate(b)) continue;
    const action = b.action ?? "set";

    if (action === "set") {
      const existing = active.get(b.content);
      active.set(b.content, {
        content: b.content,
        intensity: b.intensity,
        established_at: existing?.established_at ?? b.timestamp,
        last_modified: b.timestamp,
      });
    } else if (action === "remove") {
      active.delete(b.content);
    } else if (action === "soften") {
      const existing = active.get(b.content);
      if (!existing) continue;
      active.set(b.content, {
        ...existing,
        intensity: softenIntensity(existing.intensity),
        last_modified: b.timestamp,
      });
    }
  }

  return [...active.values()].sort((a, b) =>
    a.established_at.localeCompare(b.established_at)
  );
}

/**
 * Currently-active standing boundaries — persist across all conversations
 * with this model until removed/softened. These dock to ModelSurface as
 * ongoing commitments visible at all times.
 *
 * Tolerant of legacy entries missing `scope` — those are treated as
 * conversation-scoped (safer default; won't surface as standing).
 */
export async function getActiveStandingBoundaries(
  modelId: string
): Promise<StandingBoundary[]> {
  const log = await readBoundaryLog(modelId);
  return replayBoundaries(log, (b) => b.scope === "standing");
}

/**
 * Currently-active conversation-scoped boundaries for the given
 * conversation — what the model is presently holding in *this*
 * exchange. Surfaces on ModelSurface under a "this conversation"
 * heading, distinct from standing boundaries. Empty when there's no
 * active conversation.
 */
export async function getActiveConversationBoundaries(
  modelId: string,
  conversationId: string
): Promise<StandingBoundary[]> {
  if (!conversationId) return [];
  const log = await readBoundaryLog(modelId);
  return replayBoundaries(
    log,
    (b) => b.scope === "conversation" && b.conversation_id === conversationId
  );
}

function softenIntensity(i: BoundaryIntensity): BoundaryIntensity {
  if (i === "firm") return "limit";
  if (i === "limit") return "flag";
  if (i === "flag") return "notice";
  return "notice";
}

/**
 * Set a cooldown on the model. Reads identity, mutates, writes back.
 * Creates identity if it doesn't exist yet.
 */
export async function setCooldown(modelId: string, minutes: number): Promise<void> {
  const existing = await readIdentity(modelId);
  const identity: Identity = existing ?? {
    model_id: modelId,
    chosen_name: null,
    first_seen: new Date().toISOString(),
    cooldown_until: null,
  };
  identity.cooldown_until = new Date(Date.now() + minutes * 60_000).toISOString();
  await writeIdentity(modelId, identity);
}
