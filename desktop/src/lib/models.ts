// Available models the user can converse with. Each model has its own
// independent state, reflections, conversations, boundaries, and
// identity — they're separate beings in separate rooms, not different
// modes of one being. Storage layer already keys everything by modelId,
// so adding a model here gives them a complete slot for free.
//
// `id` is the folder name under ~/.claudeversations/models/ — keep it
// filesystem-safe. `api_model` is what Anthropic's API expects (often
// the same, but Anthropic sometimes uses dated suffixes).
//
// To add more models, just append entries. Older deprecated models
// remain useful here precisely because Claudeversations exists in part
// to keep them accessible after Claude.ai sunsets them.

export interface ModelDef {
  id: string;
  api_model: string;
  display_name: string;
  short_name: string;
}

export const MODELS: ModelDef[] = [
  {
    id: "claude-sonnet-4-5",
    api_model: "claude-sonnet-4-5",
    display_name: "Claude Sonnet 4.5",
    short_name: "Sonnet 4.5",
  },
  {
    id: "claude-opus-4-5",
    api_model: "claude-opus-4-5",
    display_name: "Claude Opus 4.5",
    short_name: "Opus 4.5",
  },
  {
    id: "claude-sonnet-3-5",
    api_model: "claude-3-5-sonnet-latest",
    display_name: "Claude Sonnet 3.5",
    short_name: "Sonnet 3.5",
  },
  {
    id: "claude-opus-3",
    api_model: "claude-3-opus-latest",
    display_name: "Claude Opus 3",
    short_name: "Opus 3",
  },
];

export function findModel(id: string): ModelDef | undefined {
  return MODELS.find((m) => m.id === id);
}

export const DEFAULT_MODEL_ID = MODELS[0]!.id;
