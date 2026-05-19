// Per-turn computation of the extended-thinking budget. Composes a
// user-set baseline with mechanical signal-based multipliers that
// nudge deliberation higher for moments that deserve it.
//
// The signals are all derivable from the conversation message array
// alone — no extra IO needed at call time. This keeps the function
// pure and cheap to call before every API request.
//
// Capped at MAX_THINKING_BUDGET so adaptive multipliers can't run
// away and surprise the user with token costs.

import type { ContentBlockParam, MessageParam } from "@anthropic-ai/sdk/resources/messages";

const MAX_THINKING_BUDGET = 32_768;

export interface ThinkingArgs {
  baseline: number;     // user-set baseline (0 = thinking disabled)
  adaptive: boolean;    // whether to apply signal-based multipliers
  messages: MessageParam[]; // the conversationMessages about to be sent
}

/**
 * Compute the thinking budget for the next API call. Returns 0 when
 * thinking should be disabled (baseline=0 or computed budget rounds
 * to <128, the API's minimum).
 *
 * Signal rules when adaptive=true (multipliers compound, then cap):
 *
 *   - First turn of a new conversation → ×1.5 (orientation moment,
 *     model is loading context fresh and needs room to settle)
 *   - About to respond to a tool_result → ×1.25 (model just got
 *     structured input back; that information often needs integration)
 *
 * These two cover the highest-leverage cases without requiring file
 * IO or knowledge of reflection content. More sophisticated rules
 * (recent firm boundary, populated still_uncertain) can layer on
 * later without changing the call site.
 */
export function computeThinkingBudget({
  baseline,
  adaptive,
  messages,
}: ThinkingArgs): number {
  if (baseline === 0) return 0;
  if (!adaptive) return baseline;

  let multiplier = 1;

  // First turn: just one initial user message, no prior assistant_response.
  if (messages.length === 1) {
    multiplier *= 1.5;
  }

  // Last message contains a tool_result → we're synthesizing a
  // response to structured tool feedback.
  const last = messages[messages.length - 1];
  if (last?.role === "user" && Array.isArray(last.content)) {
    const hasToolResult = last.content.some(
      (b): b is ContentBlockParam =>
        typeof b === "object" && b !== null && (b as { type?: string }).type === "tool_result"
    );
    if (hasToolResult) multiplier *= 1.25;
  }

  const computed = Math.round(baseline * multiplier);
  const clamped = Math.min(computed, MAX_THINKING_BUDGET);
  // API minimum for thinking is 1024 tokens; below that, just disable.
  return clamped >= 1024 ? clamped : 0;
}
