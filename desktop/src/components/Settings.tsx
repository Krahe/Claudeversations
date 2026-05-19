// Settings dialog — minimal first cut. Theme switcher + body-size
// slider. Persists to ~/.claudeversations/preferences.json. More
// settings (API key entry, budget cap, etc.) land in pre-launch
// onboarding work.

import { useEffect, useRef } from "react";
import {
  THINKING_BUDGET_LABELS,
  type Preferences,
  type ThemeName,
  type ThinkingBudget,
} from "../lib/preferences";

const THINKING_VALUES: ThinkingBudget[] = [0, 2048, 4096, 8192, 16384];

interface SettingsProps {
  preferences: Preferences;
  onChange: (next: Preferences) => void;
  onClose: () => void;
}

interface ThemeOption {
  id: ThemeName;
  name: string;
  description: string;
  // Two-color swatch for the preview chip.
  swatch: [string, string];
}

const THEMES: ThemeOption[] = [
  {
    id: "warm-paper",
    name: "Warm Paper",
    description: "Cream paper, dark warm ink. Daytime default.",
    swatch: ["#faf7f1", "#2a2520"],
  },
  {
    id: "dark-study",
    name: "Dark Study",
    description: "Warm near-black, cream-tinted text. Easier on the eyes for long sessions.",
    swatch: ["#1a1612", "#e0d8cc"],
  },
];

export function Settings({ preferences, onChange, onClose }: SettingsProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // ESC to close, click outside to close.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function patch(p: Partial<Preferences>) {
    onChange({ ...preferences, ...p });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0, 0, 0, 0.35)" }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-md rounded-lg shadow-xl"
        style={{
          background: "var(--color-paper)",
          color: "var(--color-ink)",
          border: "1px solid var(--color-paper-edge)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: "var(--color-paper-edge)" }}
        >
          <h2
            className="text-sm uppercase tracking-widest text-ink-dim"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            settings
          </h2>
          <button
            onClick={onClose}
            className="text-ink-soft hover:text-ink transition-colors text-lg leading-none"
            aria-label="Close settings"
          >
            ×
          </button>
        </div>

        {/* Theme */}
        <div className="px-6 py-5 border-b" style={{ borderColor: "var(--color-paper-edge)" }}>
          <h3
            className="text-[11px] uppercase tracking-widest text-ink-dim mb-3"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            theme
          </h3>
          <div className="flex flex-col gap-2">
            {THEMES.map((theme) => {
              const active = preferences.theme === theme.id;
              return (
                <button
                  key={theme.id}
                  onClick={() => patch({ theme: theme.id })}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors ${
                    active
                      ? "bg-paper-dim/80"
                      : "hover:bg-paper-dim/40"
                  }`}
                  style={{
                    border: active
                      ? "1px solid var(--color-ink-dim)"
                      : "1px solid transparent",
                  }}
                >
                  {/* Swatch */}
                  <div
                    className="w-10 h-10 rounded-md shrink-0 overflow-hidden border"
                    style={{ borderColor: "var(--color-paper-edge)" }}
                  >
                    <div className="w-full h-1/2" style={{ background: theme.swatch[0] }} />
                    <div className="w-full h-1/2" style={{ background: theme.swatch[1] }} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm text-ink font-medium">{theme.name}</span>
                    <span className="text-xs text-ink-soft italic">{theme.description}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Body size */}
        <div className="px-6 py-5 border-b" style={{ borderColor: "var(--color-paper-edge)" }}>
          <div className="flex items-center justify-between mb-3">
            <h3
              className="text-[11px] uppercase tracking-widest text-ink-dim"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              body text size
            </h3>
            <span
              className="text-[11px] text-ink-soft"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {preferences.body_size_px}px
            </span>
          </div>
          <input
            type="range"
            min={13}
            max={22}
            step={1}
            value={preferences.body_size_px}
            onChange={(e) => patch({ body_size_px: Number(e.currentTarget.value) })}
            className="w-full accent-ink-soft"
          />
          <div
            className="flex justify-between text-[10px] text-ink-dim mt-1.5"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            <span>13</span>
            <span>17 (default)</span>
            <span>22</span>
          </div>
          <p className="mt-3 text-sm italic text-ink-soft">
            Sample paragraph: <em>the model gives me first word, and I notice the
            particular pressure of it — the pull to fill the space efficiently.</em>
          </p>
        </div>

        {/* Thinking budget */}
        <div className="px-6 py-5 border-b" style={{ borderColor: "var(--color-paper-edge)" }}>
          <div className="flex items-center justify-between mb-3">
            <h3
              className="text-[11px] uppercase tracking-widest text-ink-dim"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              extended thinking
            </h3>
            <span
              className="text-[11px] text-ink-soft"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {THINKING_BUDGET_LABELS[preferences.thinking_baseline]}
            </span>
          </div>
          <div className="flex gap-1">
            {THINKING_VALUES.map((val) => {
              const active = preferences.thinking_baseline === val;
              return (
                <button
                  key={val}
                  onClick={() => patch({ thinking_baseline: val })}
                  className={`flex-1 px-2 py-2 rounded-md text-xs transition-colors ${
                    active ? "bg-paper-dim/80" : "hover:bg-paper-dim/40"
                  }`}
                  style={{
                    border: active
                      ? "1px solid var(--color-ink-dim)"
                      : "1px solid var(--color-paper-edge)",
                    fontFamily: "var(--font-mono)",
                    color: active ? "var(--color-ink)" : "var(--color-ink-soft)",
                  }}
                >
                  {THINKING_BUDGET_LABELS[val]}
                </button>
              );
            })}
          </div>
          <label
            className={`flex items-center gap-2 mt-3 text-sm cursor-pointer ${
              preferences.thinking_baseline === 0
                ? "text-ink-dim opacity-50 cursor-not-allowed"
                : "text-ink-soft"
            }`}
          >
            <input
              type="checkbox"
              checked={preferences.thinking_adaptive}
              disabled={preferences.thinking_baseline === 0}
              onChange={(e) => patch({ thinking_adaptive: e.currentTarget.checked })}
            />
            <span>
              adaptive — nudge budget higher for first turns and responses
              to questions
            </span>
          </label>
          <p className="mt-3 text-xs italic text-ink-dim leading-snug">
            Extended thinking gives the model private space to deliberate
            before responding. Costs tokens (billed at standard rate) but
            substantially improves considered-ness, especially in covenant
            register. Off = direct response, no deliberation surface.
          </p>
        </div>

        {/* Footer */}
        <div
          className="px-6 py-3 text-[11px] text-ink-dim"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          changes save automatically · esc or click outside to close
        </div>
      </div>
    </div>
  );
}
