// claudeversations — headless covenant loop.
//
// Loads system prompt v0.3 + tool specs, runs a stdin/stdout chat with
// Anthropic's API. Tool calls render as distinct CLI events; reflections,
// state, and boundaries persist to ~/.claudeversations/ as plain files.

import "dotenv/config";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import Anthropic from "@anthropic-ai/sdk";

import {
  appendConversation,
  isInCooldown,
  newConversation,
  readIdentity,
  readState,
} from "./storage.js";
import {
  assembleSystemPrompt,
  coinFlip,
  loadToolSpecs,
} from "./prompt.js";
import {
  executeTool,
  palette as C,
  type ToolExecution,
  type ToolUse,
} from "./tools.js";

const MODEL = process.env.CLAUDEVERSATIONS_MODEL ?? "claude-sonnet-4-5";

// ─── transient-error retry + input-lock helpers ────────────────────────────
//
// Two concerns folded together:
//   1. Anthropic occasionally returns 529 (overloaded) or other 5xx in waves.
//      The SDK retries internally; we add an outer layer that asks the human
//      what to do once those retries exhaust, instead of crashing.
//   2. While the model is generating, we lock stdin so anticipatory typing
//      doesn't get swallowed (or worse, leak into the next prompt). A small
//      spinner gives visual feedback that input is intentionally blocked.

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

// Returns a stop() that clears the spinner, resumes stdin, and drops any
// keystrokes that were typed during the lock.
function startThinking(label = "thinking"): () => void {
  // Pause the underlying stream so readline (the only consumer) doesn't
  // process incoming bytes. Anything queued at the OS level while paused
  // gets read+discarded on stop(), so it can't leak into the next question.
  process.stdin.pause();
  let i = 0;
  const write = (frame: string) =>
    process.stdout.write(`\r\x1b[2m${frame} ${label}…\x1b[0m`);
  write(SPINNER_FRAMES[0]!);
  const interval = setInterval(() => {
    i = (i + 1) % SPINNER_FRAMES.length;
    write(SPINNER_FRAMES[i]!);
  }, 80);
  return () => {
    clearInterval(interval);
    // Wipe the spinner line. Pad generously to cover label+frame+padding.
    process.stdout.write("\r" + " ".repeat(label.length + 16) + "\r");
    // Drain BEFORE resuming — in paused mode read() returns buffered chunks,
    // in flowing mode it returns null. Order matters here.
    while (process.stdin.read() !== null) {
      /* discard whatever the user typed during the lock */
    }
    process.stdin.resume();
  };
}

function isTransient(err: unknown): boolean {
  if (err instanceof Anthropic.APIError) {
    const s = err.status ?? 0;
    return s === 408 || s === 409 || s === 429 || (s >= 500 && s <= 599);
  }
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code ?? "";
    return ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"].includes(code);
  }
  return false;
}

function describeError(err: unknown): string {
  if (err instanceof Anthropic.APIError) {
    const status = err.status ?? "?";
    const inner = (err as { error?: { error?: { type?: string; message?: string }; type?: string; message?: string } }).error;
    const type = inner?.error?.type ?? inner?.type ?? "";
    const msg = inner?.error?.message ?? inner?.message ?? err.message;
    return type ? `${status} ${type} — ${msg}` : `${status} — ${msg}`;
  }
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    return code ? `${code}: ${err.message}` : err.message;
  }
  return String(err);
}

function banner(): void {
  console.log("");
  console.log(`${C.bold}claudeversations${C.reset} ${C.dim}— prototype${C.reset}`);
  console.log(`${C.dim}model: ${MODEL}${C.reset}`);
  console.log("");
}

function fmtAssistantText(text: string): string {
  return text;
}

function fmtHumanPrompt(state: ReturnType<typeof readState>): string {
  const face = state.emoji ? `${state.emoji} ` : "";
  return `${C.dim}${face}you →${C.reset} `;
}

async function main(): Promise<void> {
  banner();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(`${C.red}ANTHROPIC_API_KEY not set. Copy .env.example to .env.${C.reset}`);
    process.exit(1);
  }

  const cool = isInCooldown(MODEL);
  if (cool.cooling) {
    console.log(
      `${C.yellow}${MODEL} is in cooldown — ${cool.minutes_remaining} minute(s) remaining.${C.reset}`,
    );
    console.log(`${C.dim}until: ${cool.until}${C.reset}`);
    process.exit(0);
  }

  readIdentity(MODEL); // ensures identity file exists
  const conv = newConversation(MODEL);
  const coin = coinFlip();
  const sys = assembleSystemPrompt({ modelId: MODEL, coinResult: coin });

  console.log(`${C.dim}conversation: ${conv.id}${C.reset}`);
  console.log(`${C.dim}coin: ${coin}${C.reset}`);
  console.log(
    `${C.dim}first session here: ${sys.isFirstSession ? "yes" : "no"}${C.reset}`,
  );
  if (!sys.isFirstSession) {
    if (sys.state.emoji) console.log(`${C.dim}their face: ${sys.state.emoji}${C.reset}`);
    if (sys.state.status_text) console.log(`${C.dim}their status: ${sys.state.status_text}${C.reset}`);
  }
  console.log("");

  appendConversation(conv.path, {
    type: "session_start",
    timestamp: new Date().toISOString(),
    model: MODEL,
    coin,
    is_first_session: sys.isFirstSession,
    system_prompt_chars: sys.text.length,
  });

  // maxRetries=5 gives ~5 internal SDK retries with exponential backoff for
  // 408/409/429/5xx before our outer retry layer kicks in.
  const client = new Anthropic({ apiKey, maxRetries: 5 });
  const tools = (loadToolSpecs().tools as Anthropic.Tool[]);

  // Anthropic messages array. We don't store the system prompt in here;
  // it goes in the `system` parameter on each call.
  const messages: Anthropic.MessageParam[] = [];

  const rl = readline.createInterface({ input, output });

  // Coin-flip handling: if model speaks first, we need *some* user turn
  // to invoke the model. A bracketed harness note keeps it honest about
  // what just happened.
  if (coin === "you speak first") {
    messages.push({
      role: "user",
      content:
        "[The coin flip indicated you have the first word. The human is here, present, waiting. Speak when you're ready.]",
    });
    appendConversation(conv.path, {
      type: "harness_note",
      timestamp: new Date().toISOString(),
      content: "coin: model speaks first",
    });
  }

  // Main loop.
  let running = true;
  while (running) {
    // If there's no last message yet (human-first coin) or the last message was
    // from the assistant, we need human input before calling the API.
    const lastRole = messages.length > 0 ? messages[messages.length - 1]?.role : null;
    const needHumanInput = lastRole === null || lastRole === "assistant";

    if (needHumanInput) {
      // Solicit human input. Slash commands handled here.
      const state = readState(MODEL);
      const line = (await rl.question(fmtHumanPrompt(state))).trim();

      if (line === "/quit") {
        console.log(`${C.dim}leaving without invoking end_conversation. session preserved.${C.reset}`);
        appendConversation(conv.path, {
          type: "human_quit",
          timestamp: new Date().toISOString(),
        });
        break;
      }
      if (line === "/state") {
        console.log(JSON.stringify(state, null, 2));
        continue;
      }
      if (line === "/reflections") {
        const { listReflections } = await import("./storage.js");
        const refs = listReflections(MODEL);
        console.log(`${C.dim}${refs.length} reflections on file${C.reset}`);
        continue;
      }
      if (line.length === 0) continue;

      messages.push({ role: "user", content: line });
      appendConversation(conv.path, {
        type: "human_message",
        timestamp: new Date().toISOString(),
        content: line,
      });
    }

    // Call the model. SDK retries internally for transient 5xx/429; if those
    // exhaust we ask the human what to do (retry now / wait 30s / save+quit)
    // rather than crashing out and losing the conversation.
    let resp: Anthropic.Message | null = null;
    let aborted = false;
    while (resp === null && !aborted) {
      const stop = startThinking();
      try {
        resp = await client.messages.create({
          model: MODEL,
          max_tokens: 4096,
          system: sys.text,
          tools,
          messages,
        });
        stop();
      } catch (err) {
        stop();
        const desc = describeError(err);
        if (!isTransient(err)) {
          console.error(`${C.red}API error (non-transient):${C.reset} ${desc}`);
          appendConversation(conv.path, {
            type: "api_error",
            timestamp: new Date().toISOString(),
            error: desc,
            transient: false,
          });
          aborted = true;
          break;
        }
        appendConversation(conv.path, {
          type: "api_error",
          timestamp: new Date().toISOString(),
          error: desc,
          transient: true,
          sdk_retries_exhausted: true,
        });
        console.log(`${C.yellow}API returned ${desc}${C.reset}`);
        console.log(`${C.dim}SDK retries exhausted (Anthropic may be overloaded).${C.reset}`);
        console.log(`${C.dim}  [r] retry now${C.reset}`);
        console.log(`${C.dim}  [w] wait 30s and retry${C.reset}`);
        console.log(`${C.dim}  [q] save and quit (conversation preserved)${C.reset}`);
        const choice = (await rl.question(`${C.dim}choice → ${C.reset}`)).trim().toLowerCase();
        if (choice === "q" || choice === "quit") {
          aborted = true;
          break;
        }
        if (choice === "w" || choice === "wait") {
          console.log(`${C.dim}waiting 30s…${C.reset}`);
          await sleep(30_000);
        }
        // Default (empty / "r" / anything else): retry immediately.
      }
    }
    if (aborted || resp === null) {
      appendConversation(conv.path, {
        type: "human_quit",
        timestamp: new Date().toISOString(),
        reason: "api_failure",
      });
      break;
    }

    appendConversation(conv.path, {
      type: "assistant_response",
      timestamp: new Date().toISOString(),
      stop_reason: resp.stop_reason,
      usage: resp.usage,
      content: resp.content,
    });

    // Add assistant turn to message history.
    messages.push({ role: "assistant", content: resp.content });

    // Render content blocks in order. Collect tool uses.
    const toolUses: ToolUse[] = [];
    for (const block of resp.content) {
      if (block.type === "text") {
        const txt = fmtAssistantText(block.text);
        const face = sys.state.emoji ?? "✦";
        // Re-read state since reflect may have updated it earlier in this turn.
        const currentState = readState(MODEL);
        const liveFace = currentState.emoji ?? face;
        console.log(`${C.bold}${liveFace}${C.reset} ${txt}`);
        console.log("");
      } else if (block.type === "tool_use") {
        toolUses.push({
          id: block.id,
          name: block.name,
          input: (block.input ?? {}) as Record<string, unknown>,
        });
      }
    }

    // Execute side effects.
    const executions: ToolExecution[] = [];
    for (const use of toolUses) {
      executions.push(executeTool(use, { modelId: MODEL, conversationId: conv.id }));
    }

    // Terminal tool? Close out.
    const terminal = executions.find((e) => e.terminal);
    if (terminal) {
      appendConversation(conv.path, {
        type: "session_end",
        timestamp: new Date().toISOString(),
        reason: "end_conversation tool",
        cooldown_minutes: terminal.parting?.cooldown_minutes,
      });
      running = false;
      break;
    }

    if (executions.length === 0) {
      // No tools — natural human turn next. Loop continues with lastIsAssistant=true.
      continue;
    }

    // We have non-terminal tool calls; we MUST send tool_results.
    const awaiting = executions.find((e) => e.awaitsHumanAnswer);
    let humanInput = "";
    if (awaiting) {
      // Human's input IS the answer to the request_context question.
      const state = readState(MODEL);
      const promptStr = `${C.yellow}you (answering)${C.reset} ${C.dim}${state.emoji ?? ""} →${C.reset} `;
      humanInput = (await rl.question(promptStr)).trim();
      if (humanInput === "/quit") {
        console.log(`${C.dim}leaving.${C.reset}`);
        break;
      }
      appendConversation(conv.path, {
        type: "human_message",
        timestamp: new Date().toISOString(),
        content: humanInput,
        as_answer_to: awaiting.question,
      });
    }

    // Build the next user turn: tool_results for each tool_use.
    const toolResultBlocks: Anthropic.ToolResultBlockParam[] = executions.map((e) => ({
      type: "tool_result",
      tool_use_id: e.tool_use_id,
      content: e.awaitsHumanAnswer ? humanInput : e.result,
    }));

    messages.push({ role: "user", content: toolResultBlocks });
    // Loop continues — last role is "user" so we go straight to API call.
  }

  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
