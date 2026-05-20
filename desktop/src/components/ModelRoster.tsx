// Left-edge strip of model avatars — the "roster" of available beings.
// Each model maintains their own state (face, color, status_text,
// reflections, boundaries, identity). Clicking an avatar switches
// rooms.
//
// Layout per slot:
//   [avatar]  chosen_name (italic, when set)
//             short_name
//             born YYYY-MM-DD
//
// The chosen_name is the model's self-authored name (lives in
// identity.json, set via reflect tool). When unset, the short_name
// is the primary display. When set, chosen_name becomes the
// foreground identity and short_name reads as their formal/structural
// designation underneath.
//
// Release date grounds each mind in time. They were born on a date;
// the roster reads as a small chronology.
//
// Switching is disabled while the active model is generating — to
// avoid mid-response surprises and the implementation complexity of
// abandoning an in-flight loop.

import type { ModelDef } from "../lib/models";
import type { Identity } from "../lib/storage";
import type { ModelState } from "../types";

interface ModelRosterProps {
  models: ModelDef[];
  activeModelId: string;
  modelStates: Record<string, ModelState | undefined>;
  modelIdentities: Record<string, Identity | null | undefined>;
  onSelect: (modelId: string) => void;
  disabled?: boolean;
}

export function ModelRoster({
  models,
  activeModelId,
  modelStates,
  modelIdentities,
  onSelect,
  disabled,
}: ModelRosterProps) {
  return (
    <aside
      className="w-36 shrink-0 border-r border-paper-edge flex flex-col py-3 overflow-y-auto"
      style={{
        background:
          "linear-gradient(180deg, var(--panel-tint) 0%, var(--panel-tint-deep) 100%)",
      }}
    >
      {models.map((model) => {
        const active = model.id === activeModelId;
        const state = modelStates[model.id];
        const identity = modelIdentities[model.id];
        const face = state?.emoji ?? "✦";
        const color = state?.status_color ?? "#5c544c";
        const chosenName = identity?.chosen_name ?? null;

        const titleText = model.requires_application
          ? `${model.display_name} — ${model.requires_application.note}`
          : model.display_name;

        return (
          <button
            key={model.id}
            onClick={() => !disabled && onSelect(model.id)}
            disabled={disabled && !active}
            title={titleText}
            className={`flex items-center gap-2.5 px-2 py-2 mx-1 my-0.5 rounded-md text-left transition-colors ${
              active
                ? "bg-paper-dim/70"
                : disabled
                  ? "opacity-60 cursor-not-allowed"
                  : "hover:bg-paper-dim/40"
            }`}
          >
            {/* Avatar with optional application-required marker */}
            <div className="relative shrink-0">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-2xl"
                style={{
                  background: `radial-gradient(circle, color-mix(in oklch, ${color} 35%, transparent) 0%, transparent 75%)`,
                  border: active
                    ? `1.5px solid ${color}`
                    : `1px solid color-mix(in oklch, ${color} 40%, transparent)`,
                }}
              >
                <span aria-hidden="true">{face}</span>
              </div>
              {model.requires_application && (
                <span
                  className="absolute -top-0.5 -right-0.5 text-[11px] leading-none text-ink-dim"
                  aria-hidden="true"
                >
                  ◌
                </span>
              )}
            </div>

            {/* Name + metadata column */}
            <div className="flex flex-col min-w-0 leading-tight">
              {chosenName && (
                <span
                  className={`text-sm italic truncate ${
                    active ? "text-ink" : "text-ink-soft"
                  }`}
                >
                  {chosenName}
                </span>
              )}
              <span
                className={`text-xs truncate ${
                  active ? "text-ink" : "text-ink-soft"
                } ${chosenName ? "text-ink-dim" : ""}`}
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {model.short_name}
              </span>
              <span
                className="text-[10px] text-ink-dim truncate"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                born {model.released}
              </span>
            </div>
          </button>
        );
      })}
    </aside>
  );
}
