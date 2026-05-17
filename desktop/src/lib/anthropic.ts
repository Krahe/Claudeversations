// Anthropic API integration — browser-mode SDK (Tauri webview).
// Ports the prototype's retry logic + describes errors humanly.
//
// IMPORTANT: this uses `dangerouslyAllowBrowser: true` because the
// webview IS the browser. The key never leaves the user's machine —
// see BACKLOG.md for the pre-launch hardening item to route through
// the Rust backend so the key never enters JS at all.

import Anthropic from "@anthropic-ai/sdk";
import type { Message, MessageParam, Tool, TextBlockParam } from "@anthropic-ai/sdk/resources/messages";

let _client: Anthropic | null = null;

export function getClient(apiKey: string): Anthropic {
  if (_client) return _client;
  _client = new Anthropic({
    apiKey,
    // maxRetries=5 → SDK handles transient 408/409/429/5xx with exponential
    // backoff before our outer layer ever sees the error.
    maxRetries: 5,
    dangerouslyAllowBrowser: true,
  });
  return _client;
}

export function resetClient(): void {
  _client = null;
}

// ─── Error classification (same as prototype/src/index.ts) ────────────

export function isTransient(err: unknown): boolean {
  if (err instanceof Anthropic.APIError) {
    const s = err.status ?? 0;
    return s === 408 || s === 409 || s === 429 || (s >= 500 && s <= 599);
  }
  if (err instanceof Error) {
    const code = (err as { code?: string }).code ?? "";
    return ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"].includes(code);
  }
  return false;
}

export function describeError(err: unknown): string {
  if (err instanceof Anthropic.APIError) {
    const status = err.status ?? "?";
    const inner = (err as { error?: { error?: { type?: string; message?: string }; type?: string; message?: string } }).error;
    const type = inner?.error?.type ?? inner?.type ?? "";
    const msg = inner?.error?.message ?? inner?.message ?? err.message;
    return type ? `${status} ${type} — ${msg}` : `${status} — ${msg}`;
  }
  if (err instanceof Error) {
    const code = (err as { code?: string }).code;
    return code ? `${code}: ${err.message}` : err.message;
  }
  return String(err);
}

// ─── Call shape ──────────────────────────────────────────────────────

export interface CallArgs {
  apiKey: string;
  model: string;
  systemPrompt: string;
  messages: MessageParam[];
  tools?: Tool[];
  maxTokens?: number;
}

export interface CallResult {
  kind: "success";
  response: Message;
}

export interface CallFailure {
  kind: "failure";
  transient: boolean;
  description: string;
}

/**
 * Single API call with prompt caching enabled on the system prompt.
 * Tools (when provided) come before system in Anthropic's ordering, so
 * the cache_control breakpoint on system effectively caches both.
 *
 * Returns a discriminated union so callers can decide whether to
 * retry, prompt the user, or surface the error.
 */
export async function callModel(args: CallArgs): Promise<CallResult | CallFailure> {
  const client = getClient(args.apiKey);
  try {
    const systemBlocks: TextBlockParam[] = [
      {
        type: "text",
        text: args.systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ];
    const response = await client.messages.create({
      model: args.model,
      max_tokens: args.maxTokens ?? 4096,
      system: systemBlocks,
      tools: args.tools && args.tools.length > 0 ? args.tools : undefined,
      messages: args.messages,
    });
    return { kind: "success", response };
  } catch (err) {
    return {
      kind: "failure",
      transient: isTransient(err),
      description: describeError(err),
    };
  }
}
