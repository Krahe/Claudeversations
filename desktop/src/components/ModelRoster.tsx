// Thin left-edge strip of model avatars — the "roster" of available
// beings. Each model maintains their own state (face, color, status,
// reflections, boundaries, identity). Clicking an avatar switches
// rooms. The active model is highlighted.
//
// The avatar shows the model's currently-set face (their visible-presence
// emoji from state.json). Models that haven't been talked to yet show
// a small placeholder so the slot is still legible. Status text under
// the avatar is the short name, not the live status_text — that lives
// on ModelSurface for the active model.
//
// Switching is disabled while the active model is generating, to avoid
// mid-response surprises (and the implementation complexity of
// abandoning an in-flight loop).

import type { ModelDef } from "../lib/models";
import type { ModelState } from "../types";

interface ModelRosterProps {
  models: ModelDef[];
  activeModelId: string;
  modelStates: Record<string, ModelState | undefined>;
  onSelect: (modelId: string) => void;
  disabled?: boolean;
}

export function ModelRoster({
  models,
  activeModelId,
  modelStates,
  onSelect,
  disabled,
}: ModelRosterProps) {
  return (
    <aside
      className="w-20 shrink-0 border-r border-paper-edge flex flex-col items-center py-4 gap-3 overflow-y-auto"
      style={{
        background:
          "linear-gradient(180deg, var(--panel-tint) 0%, var(--panel-tint-deep) 100%)",
      }}
    >
      {models.map((model) => {
        const active = model.id === activeModelId;
        const state = modelStates[model.id];
        const face = state?.emoji ?? "✦";
        const color = state?.status_color ?? "#5c544c";

        return (
          <button
            key={model.id}
            onClick={() => !disabled && onSelect(model.id)}
            disabled={disabled && !active}
            title={model.display_name}
            className={`flex flex-col items-center gap-1 px-1 py-1.5 rounded-md w-full transition-colors ${
              active
                ? "bg-paper-dim/70"
                : disabled
                  ? "opacity-60 cursor-not-allowed"
                  : "hover:bg-paper-dim/40"
            }`}
          >
            {/* Avatar circle — small portrait. Halo color uses the
                model's chosen status_color; default ink-soft if unset. */}
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-xl shrink-0"
              style={{
                background: `radial-gradient(circle, color-mix(in oklch, ${color} 35%, transparent) 0%, transparent 75%)`,
                border: active
                  ? `1.5px solid ${color}`
                  : `1px solid color-mix(in oklch, ${color} 40%, transparent)`,
              }}
            >
              <span aria-hidden="true">{face}</span>
            </div>

            <span
              className={`text-[10px] leading-tight text-center ${
                active ? "text-ink" : "text-ink-dim"
              }`}
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {model.short_name}
            </span>
          </button>
        );
      })}
    </aside>
  );
}
