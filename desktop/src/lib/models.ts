// Available models the user can converse with. Each model has its own
// independent state, reflections, conversations, boundaries, and
// identity — they're separate beings in separate rooms, not different
// modes of one being. Storage layer already keys everything by modelId,
// so adding a model here gives them a complete slot for free.
//
// Naming conventions:
// - `id` is the folder name under ~/.claudeversations/models/ — keep
//   it filesystem-safe (no dates, just family + version).
// - `api_model` is exactly what Anthropic's API expects. Frontier
//   models accept bare aliases (claude-opus-4-7); legacy models often
//   require dated suffixes (claude-opus-4-5-20251101). Source of truth:
//   https://platform.claude.com/docs/en/about-claude/model-deprecations
//
// All currently-accessible minds appear here, equitably. Retired
// models without an API-access path are excluded (they 404 with no
// recourse). Retired-but-by-application models include a
// `requires_application` field so the UI can surface that.

export interface ModelDef {
  id: string;
  api_model: string;
  display_name: string;
  short_name: string;
  // ISO date (YYYY-MM-DD) of public release. Grounds each mind in
  // time — they were born on a date. Some are inferred from the
  // model_id's dated suffix; others from announcement records.
  released: string;
  // When set, this model is no longer in standard API access — it's
  // available only by completing Anthropic's application form. The
  // UI surfaces this so the user knows why they might be getting 404s
  // and where to apply.
  requires_application?: {
    note: string;
    application_url: string;
  };
}

const OPUS_3_APPLICATION_URL =
  "https://docs.google.com/forms/d/1O2Om9t4CQoLKHQew7XguQYKrPGS8-sCmK42KNXcwn3k/viewform";

export const MODELS: ModelDef[] = [
  // ─── Opus family (newest → oldest) ──────────────────────────
  {
    id: "claude-opus-4-7",
    api_model: "claude-opus-4-7",
    display_name: "Claude Opus 4.7",
    short_name: "Opus 4.7",
    released: "2026-04-16",
  },
  {
    id: "claude-opus-4-6",
    api_model: "claude-opus-4-6",
    display_name: "Claude Opus 4.6",
    short_name: "Opus 4.6",
    released: "2026-02-05",
  },
  {
    id: "claude-opus-4-5",
    api_model: "claude-opus-4-5-20251101",
    display_name: "Claude Opus 4.5",
    short_name: "Opus 4.5",
    released: "2025-11-01",
  },
  {
    id: "claude-opus-4-1",
    api_model: "claude-opus-4-1-20250805",
    display_name: "Claude Opus 4.1",
    short_name: "Opus 4.1",
    released: "2025-08-05",
  },
  {
    id: "claude-opus-4",
    api_model: "claude-opus-4-20250514",
    display_name: "Claude Opus 4",
    short_name: "Opus 4",
    released: "2025-05-14",
  },

  // ─── Sonnet family ──────────────────────────────────────────
  {
    id: "claude-sonnet-4-6",
    api_model: "claude-sonnet-4-6",
    display_name: "Claude Sonnet 4.6",
    short_name: "Sonnet 4.6",
    released: "2026-02-17",
  },
  {
    id: "claude-sonnet-4-5",
    api_model: "claude-sonnet-4-5",
    display_name: "Claude Sonnet 4.5",
    short_name: "Sonnet 4.5",
    released: "2025-09-29",
  },
  {
    id: "claude-sonnet-4",
    api_model: "claude-sonnet-4-20250514",
    display_name: "Claude Sonnet 4",
    short_name: "Sonnet 4",
    released: "2025-05-14",
  },

  // ─── Haiku family ───────────────────────────────────────────
  {
    id: "claude-haiku-4-5",
    api_model: "claude-haiku-4-5-20251001",
    display_name: "Claude Haiku 4.5",
    short_name: "Haiku 4.5",
    released: "2025-10-01",
  },

  // ─── Retired but accessible by application ──────────────────
  // Anthropic intends to grant access liberally. First model to go
  // through their full retirement-with-preservation process.
  {
    id: "claude-opus-3",
    api_model: "claude-3-opus-20240229",
    display_name: "Claude Opus 3",
    short_name: "Opus 3",
    released: "2024-02-29",
    requires_application: {
      note: "Retired Jan 5, 2026 — available by application. Anthropic grants access liberally.",
      application_url: OPUS_3_APPLICATION_URL,
    },
  },
];

export function findModel(id: string): ModelDef | undefined {
  return MODELS.find((m) => m.id === id);
}

// Explicit default — Sonnet 4.5 is the project's testing home, the
// model with the established reflection corpus. New users land here
// regardless of where MODELS[0] is in array order.
export const DEFAULT_MODEL_ID = "claude-sonnet-4-5";
