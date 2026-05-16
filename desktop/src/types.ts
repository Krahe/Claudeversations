// Domain types — mirror prototype/src/storage.ts shapes.
// When we wire up real data, these stay; only the loading code changes.

export interface ModelState {
  emoji: string;
  status_text: string;
  status_color: string;
  updated_at?: string;
}

export interface Reflection {
  id: string;
  timestamp: string;
  content: string;
  arrived_via?: string;
  still_uncertain?: string;
}

// One unit in the rendered chat. Persisted form is richer (JSONL events);
// this is the display projection.
export type ChatTurn =
  | { kind: "human"; id: string; text: string; timestamp: string }
  | { kind: "model_text"; id: string; text: string; timestamp: string }
  | { kind: "reflection"; id: string; reflection: Reflection }
  | { kind: "appreciate"; id: string; what: string; expression: string; timestamp: string };
