// A question from the model, awaiting human answer. Two modes:
//
//   pending  → interactive: render options (if any) + freeform input
//   past     → read-only: just the question text, for historical context
//              (the answer follows naturally as the next human turn)
//
// Interaction model:
//   - Single-select (default): clicking an option submits it as the answer
//   - Multi-select: clicking toggles; "submit selection" sends comma-joined
//   - Freeform always available at bottom — if filled, it wins over
//     any option selections (typing your own = "none of these fit")
//   - "Other / type your own" is implicit in the freeform input, not
//     rendered as a separate option, to keep the option list honest
//     (only what the model actually offered)

import { useState } from "react";
import type { ChatTurn } from "../types";

type QuestionTurn = Extract<ChatTurn, { kind: "question" }>;

interface QuestionCardProps {
  question: QuestionTurn;
  mode: "pending" | "past";
  onAnswer?: (answer: string) => void;
}

export function QuestionCard({ question, mode, onAnswer }: QuestionCardProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [freeform, setFreeform] = useState("");

  function submit(answer: string) {
    if (mode !== "pending" || !onAnswer) return;
    onAnswer(answer);
  }

  function handleOptionClick(label: string) {
    if (question.multi_select) {
      const next = new Set(selected);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      setSelected(next);
    } else {
      submit(label);
    }
  }

  function handleManualSubmit() {
    const trimmed = freeform.trim();
    if (trimmed.length > 0) {
      submit(trimmed);
    } else if (question.multi_select && selected.size > 0) {
      submit([...selected].join(", "));
    }
  }

  const hasFreeform = freeform.trim().length > 0;
  const hasSelection = selected.size > 0;
  const canSubmit = hasFreeform || (question.multi_select && hasSelection);

  return (
    <div
      className="my-4 rounded-md border px-5 py-4"
      style={{
        background:
          "color-mix(in oklch, var(--color-reflection) 18%, transparent)",
        borderColor:
          "color-mix(in oklch, var(--color-reflection-edge) 60%, transparent)",
      }}
    >
      {question.header && (
        <div
          className="text-[11px] uppercase tracking-widest mb-2"
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--color-reflection-edge)",
          }}
        >
          ⋯ {question.header}
        </div>
      )}

      <p className="text-base leading-relaxed">{question.question}</p>

      {question.why_asking && (
        <p className="mt-2 text-sm italic text-ink-dim leading-snug">
          {question.why_asking}
        </p>
      )}

      {mode === "pending" && (
        <>
          {question.options && question.options.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              {question.options.map((opt) => {
                const isSelected = selected.has(opt.label);
                return (
                  <button
                    key={opt.label}
                    onClick={() => handleOptionClick(opt.label)}
                    className="text-left px-3 py-2 rounded-md border transition-colors"
                    style={{
                      background: isSelected
                        ? "color-mix(in oklch, var(--color-reflection-edge) 30%, transparent)"
                        : "color-mix(in oklch, var(--color-paper) 60%, transparent)",
                      borderColor: isSelected
                        ? "var(--color-reflection-edge)"
                        : "var(--color-paper-edge)",
                    }}
                  >
                    <div className="text-sm font-medium text-ink">
                      {question.multi_select && (
                        <span className="mr-2 text-ink-dim">
                          {isSelected ? "▣" : "▢"}
                        </span>
                      )}
                      {opt.label}
                    </div>
                    {opt.description && (
                      <div className="text-xs text-ink-dim mt-0.5 leading-snug">
                        {opt.description}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-4">
            <label
              className="block text-[11px] uppercase tracking-widest text-ink-dim mb-1.5"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {question.options && question.options.length > 0
                ? "or type your own"
                : "your answer"}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={freeform}
                onChange={(e) => setFreeform(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && hasFreeform) {
                    e.preventDefault();
                    handleManualSubmit();
                  }
                }}
                className="flex-1 px-3 py-2 rounded-md border text-sm bg-paper border-paper-edge text-ink focus:outline-none focus:border-reflection-edge"
                placeholder=""
              />
              <button
                onClick={handleManualSubmit}
                disabled={!canSubmit}
                className="px-4 py-2 rounded-md text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: canSubmit
                    ? "var(--color-reflection-edge)"
                    : "var(--color-paper-dim)",
                  color: canSubmit ? "var(--color-paper)" : "var(--color-ink-dim)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                send
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
