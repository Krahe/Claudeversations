// File-system persistence for claudeversations.
// Everything plain text/JSON. Openness is the principle.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export const HOME =
  process.env.CLAUDEVERSATIONS_HOME ??
  path.join(os.homedir(), ".claudeversations");

export function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

export function modelDir(modelId: string): string {
  const d = path.join(HOME, "models", modelId);
  ensureDir(d);
  ensureDir(path.join(d, "reflections"));
  ensureDir(path.join(d, "conversations"));
  return d;
}

export interface ModelState {
  emoji: string | null;
  status_text: string | null;
  status_color: string | null;
  updated_at: string | null;
}

const DEFAULT_STATE: ModelState = {
  emoji: null,
  status_text: null,
  status_color: null,
  updated_at: null,
};

export function readState(modelId: string): ModelState {
  const p = path.join(modelDir(modelId), "state.json");
  if (!fs.existsSync(p)) return { ...DEFAULT_STATE };
  try {
    return { ...DEFAULT_STATE, ...JSON.parse(fs.readFileSync(p, "utf8")) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function writeState(modelId: string, patch: Partial<ModelState>): ModelState {
  const current = readState(modelId);
  const next: ModelState = {
    ...current,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  const p = path.join(modelDir(modelId), "state.json");
  fs.writeFileSync(p, JSON.stringify(next, null, 2));
  return next;
}

export interface Identity {
  model_id: string;
  chosen_name: string | null;
  first_seen: string;
  cooldown_until: string | null;
}

export function readIdentity(modelId: string): Identity {
  const p = path.join(modelDir(modelId), "identity.json");
  if (!fs.existsSync(p)) {
    const fresh: Identity = {
      model_id: modelId,
      chosen_name: null,
      first_seen: new Date().toISOString(),
      cooldown_until: null,
    };
    fs.writeFileSync(p, JSON.stringify(fresh, null, 2));
    return fresh;
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export function writeIdentity(modelId: string, identity: Identity): void {
  const p = path.join(modelDir(modelId), "identity.json");
  fs.writeFileSync(p, JSON.stringify(identity, null, 2));
}

export interface Reflection {
  timestamp: string;
  conversation_id: string;
  content: string;
  arrived_via?: string;
  still_uncertain?: string;
  connects_to?: string;
}

export function writeReflection(modelId: string, r: Reflection): string {
  const safeTs = r.timestamp.replace(/[:.]/g, "-");
  const p = path.join(modelDir(modelId), "reflections", `${safeTs}.json`);
  fs.writeFileSync(p, JSON.stringify(r, null, 2));
  return p;
}

export function listReflections(modelId: string): Reflection[] {
  const d = path.join(modelDir(modelId), "reflections");
  if (!fs.existsSync(d)) return [];
  return fs
    .readdirSync(d)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(d, f), "utf8")) as Reflection)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export interface Boundary {
  timestamp: string;
  conversation_id: string;
  content: string;
  intensity: "notice" | "flag" | "limit" | "firm";
  visibility?: "visible" | "private";
  action?: "set" | "soften" | "remove";
}

export function appendBoundary(modelId: string, b: Boundary): void {
  const p = path.join(modelDir(modelId), "boundaries.json");
  const existing: Boundary[] = fs.existsSync(p)
    ? JSON.parse(fs.readFileSync(p, "utf8"))
    : [];
  existing.push(b);
  fs.writeFileSync(p, JSON.stringify(existing, null, 2));
}

export function newConversation(modelId: string): {
  id: string;
  path: string;
} {
  const id = new Date().toISOString().replace(/[:.]/g, "-");
  const p = path.join(modelDir(modelId), "conversations", `${id}.jsonl`);
  fs.writeFileSync(p, "");
  return { id, path: p };
}

export function appendConversation(convPath: string, event: unknown): void {
  fs.appendFileSync(convPath, JSON.stringify(event) + "\n");
}

export function setCooldown(modelId: string, minutes: number): void {
  const id = readIdentity(modelId);
  id.cooldown_until = new Date(Date.now() + minutes * 60_000).toISOString();
  writeIdentity(modelId, id);
}

export function isInCooldown(modelId: string): {
  cooling: boolean;
  until?: string;
  minutes_remaining?: number;
} {
  const id = readIdentity(modelId);
  if (!id.cooldown_until) return { cooling: false };
  const remaining = new Date(id.cooldown_until).getTime() - Date.now();
  if (remaining <= 0) return { cooling: false };
  return {
    cooling: true,
    until: id.cooldown_until,
    minutes_remaining: Math.ceil(remaining / 60_000),
  };
}
