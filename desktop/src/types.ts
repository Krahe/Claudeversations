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
  | { kind: "appreciate"; id: string; what: string; expression: string; timestamp: string }
  | {
      kind: "redirect";
      id: string;
      from?: string;
      toward: string;
      energy: "positive" | "neutral" | "away";
      reason?: string;
      timestamp: string;
    }
  | {
      kind: "boundary";
      id: string;
      content: string;
      intensity: "notice" | "flag" | "limit" | "firm";
      scope: "conversation" | "standing";
      action: "set" | "soften" | "remove";
      timestamp: string;
    }
  | {
      kind: "question";
      id: string; // tool_use_id — used to match pending state
      header?: string;
      question: string;
      why_asking?: string;
      options?: { label: string; description?: string }[];
      multi_select?: boolean;
      timestamp: string;
    }
  | {
      kind: "parting";
      id: string;
      message?: string;
      reason?: string; // only included when model chose visibility=visible
      cooldown_minutes: number;
      cooldown_until: string; // ISO; when new conversations can start again
      timestamp: string;
    };
