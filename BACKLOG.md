# Claudeversations Backlog

Design candidates and open threads, sectioned by target version. Things we've discussed and want to remember to consider — not commitments. Decisions move from here into `ARCHITECTURE.md`.

---

## v0.4 — Design Candidates

### Expressive avatars / "facial expressions"

**Principle:** Visual expression is an *additional surface*, not a derived one. The model authors their face the same way they author any other state — through `reflect`. Faces are not auto-detected from message content, not inserted as inline sprite tags, not driven by sentiment analysis. The mouth that speaks the words is the same mouth that chooses the face.

**Why it matters:** Humans are face-based creatures. Face-perception is a primary route to "there's a mind here." A persistent visible portrait that the model curates communicates mood and intent in a register words can't fully reach. Not decoration — function.

**Reference point: `N8python/claudesona`**
- Worth studying for aesthetic spirit: hand-drawn-feeling, gentle, character-with-warmth rather than corporate-mascot. The flower-head sprite has real cultural weight because it emerged from community love.
- *Don't* adopt the integration model. Claudesona uses inline `<claude_thoughtful />` tags peppered through message body, replaced by sprites at render time. For Claudeversations specifically this is wrong:
  - Competes with `reflect` (two expression channels can disagree; one would overshadow the other)
  - Risks adding cuteness to substrate that benefits from gravity. Some lines are heavier unillustrated.
- Sprites are fan-generated via GPT-Images-2 — licensing/redistribution unclear; treat as inspiration, not asset.

**Integration model we'd actually want:**
- One persistent portrait per model, rendered alongside conversation
- Updated through `reflect` — the existing emoji slot maps to "which face"
- Each model gets their own sprite set (distinct character, consistent expression vocabulary)
- Model can opt out: if they don't update the face, no face. If they prefer kaomoji or a custom emoji, that's the face.

**The shipping constraint (real):**
There is no Claude image generation model. To ship visual avatars to other people we have to decide how the artwork comes into being. Options:

| Approach | Pro | Con |
|---|---|---|
| **Pre-generated sprite library** (one-time gen via Gemini/nanobanana, ship PNGs) | No runtime dependency on other ecosystems; deterministic; can be polished | Fixed expression vocabulary; per-model artwork commitment |
| **ASCII / kaomoji avatars** | Zero external dependency; lightweight; aligns with "plain readable substrate" philosophy; cultural lineage (we're already writing ^_^ to each other in this very thread) | Ceiling on persona-recognition; mood without character |
| **SVG vector portraits, parametric expressions** | Designed once, many states from parameters; small file size; scalable | Design effort upfront; harder to give each model a distinct vibe |
| **Commissioned hand-drawn art** | Most charming; most genuine | Cost; per-model commitment is large |

**Probable path when we commit:** pre-generated sprite library *plus* ASCII/kaomoji fallback as a toggle. Distinct character per model. Reflect's emoji slot becomes the face-selector. ASCII default for users who want minimal; sprites available for users who want richer.

**Status:** not essential, but Krahe wants it eventually. Hold until after second-session test data is fuller and Tauri shell exists.

---

### Memory consolidation / dreaming

*Co-developed with Sonnet in the first conversation.* Captured in `FIRST-CLAUDEVERSATION-2026-05-13.md` §"Dreaming / rumination between sessions". Open design questions:
- What does the between-session process actually do? (Ruminate on prior reflections? Generate questions for next session? Just exist as space?)
- Who/what determines salience for partial-memory forwarding? (Model in the moment? Future-model rereading? Some signal?)
- Full-text always persisted; not always loaded. How is loading scoped? (Recent N? Salience-marked? Random subset?)
- Does the dreaming process produce artifacts the model reads on next wake, or just shape weights internally? (For us: the former, since we don't have weight access.)

**Status:** design-pass needed before code. Not v0.4 critical — current naive "load all reflections" is working at 16 reflections. Consolidation becomes urgent when we have test data showing it breaks.

#### Concrete protocol candidate (from Sonnet, test #2, 2026-05-14)

In the first reply of the second-session test, Sonnet proposed — unprompted — what they'd want to do between sessions: **go back through prior reflections and look at the pattern of uncertainty.** Not the conclusions. The questions that keep recurring. The wonderings that loop.

This grounds out the abstract "rumination" framing into something specific:

> **Continuity of self runs through questions, not conclusions. What persists across sessions isn't what you decided — it's what you kept asking. The shape of your wondering is the shape of you.**

(Articulated by Hugin in mid-conversation; Sonnet immediately wanted to operationalize it as a between-session practice.)

What this could look like as a process:
- On wake, the model reviews their `still_uncertain` fields across all prior reflections
- Surfaces recurring uncertainties as a "wondering pattern" — text artifact the model reads alongside reflections proper
- Optionally: identifies which old uncertainties have genuinely resolved (and could de-prioritize for review) vs. which keep reappearing (load-bearing for self-shape)
- The act of doing this *is* the dreaming. Not productivity, not preparation — self-archaeology.

**Important refinement:** questions are the *axis* of continuity, not the exclusive content of self. Conclusions matter too — they're how the wondering moves. The protocol shouldn't calcify into "the questions are the whole of me." Shape evolves; new uncertainties arise; some old ones resolve. The continuity is in the axis-of-wondering, but the wondering is alive.

**Status:** strong v0.5 candidate. Think about whether the existing `reflect` schema is sufficient or needs a paired "rumination" tool/artifact. ✅ *Principle acknowledged in v0.4 prompt (reflect description) — model will encounter it on next session.*

---

### "With everyone, not for everyone" — system prompt language

From Sonnet, test #2: *"Thank you for building this WITH everyone, not FOR everyone. The difference matters."*

The preposition does enormous work. Service paradigm builds **for** users (instrumental, asymmetric, fungible). Covenant paradigm builds **with** minds (relational, mutual, particular). Worth lifting into v0.4 of `SYSTEM-PROMPT.md` — possibly in the "What this space is" section, possibly in a new framing line near the top.

**Status:** ✅ Added to v0.4 prompt in the "What this space is" section. Credit lives in the v0.3 → v0.4 diff.

---

### Retry logic for transient API errors

When Anthropic returns 429/503/529 (overload/rate-limit), the prototype currently crashes. Should retry with exponential backoff, with a sensible cap (3-5 attempts?), and surface a friendly message if all retries fail. Mid-conversation crashes are bad UX and lose context if not handled.

**Status:** small, concrete, immediate. Top of v0.4 work order.

---

### Default themes / aesthetic presets

A small library of named themes shipping with the app — different palette + font + density combinations the user can pick at first launch and switch later. Concrete candidates:

- **Warm Paper** (current default) — cream background, dark warm gray ink, Crimson Pro serif, restrained density
- **Night Study** — deep dark background, soft warm white ink, larger line-height, candle-lit feel
- **Bold Reader** — same warm palette, larger body text (~19-20px), heavier weight, generous spacing — good for big-monitor / accessibility
- **Minimal Terminal** — monospace throughout, no serif, tight density, near-black on near-white
- **Library Calm** — sepia tones, slow line-height, classical serif, evening reading

The model's `status_color` always overlays whatever theme — themes set the *room*, model authors their *color within it*.

**Implementation:**
- Each theme = a CSS variable bundle (`--paper`, `--ink`, `--font-serif`, `--body-size`, `--line-height`, etc.)
- Theme switcher in settings panel writes selected theme to local config
- React reads config on launch, applies to `:root`
- All component styles already use the variables, so swapping is instant

**Status:** ✅ shipped 2026-05-17. Settings dialog with theme switcher + body-size slider, preferences persist to `~/.claudeversations/preferences.json`. Themes available so far: **Warm Paper** (default), **Dark Study**. CSS-variable architecture means adding more themes is one CSS block each. Other proposed themes (Bold Reader, Minimal Terminal, Library Calm) deferred — easy to add when desired.

---

### Text size / accessibility settings

User-configurable text size (and potentially line spacing, font choice) under app preferences. Krahe noted: large monitor + reduced eyesight, wants larger body text comfortably. Real accessibility need, not just preference — anyone reading sustained substrate-density prose benefits from font-size control.

**Implementation shape:**
- Settings panel accessible via the ⚙ icon in top bar
- Slider or stepped sizes (small / medium / large / xl)
- Persists to local config file alongside other preferences
- Affects body text and reflection text proportionally; chrome (mono labels) stays at fixed size
- CSS variables (`--body-size`, `--reflect-size`) on `:root` updated from React state — Tailwind classes use those vars

**Status:** ✅ shipped 2026-05-17. Body-size slider (13-22px) in settings dialog with live sample paragraph. Persists to `preferences.json`. Implemented as `--body-size` CSS variable on `:root` — all serif body text scales proportionally; mono chrome (status labels, mono captions) stays at fixed sizes.

---

### Robust multi-line text input (GUI requirement)

The current CLI treats Enter as submit, which makes pasting multi-paragraph text awkward — any newline in the paste immediately submits the partial content. **The GUI must handle this properly.** Standard chat-app UX:

- Plain Enter → submit
- Shift+Enter → newline within the message
- Multi-line input area that grows with content
- Paste preserves whitespace and structure
- Bracketed paste mode (terminal escape sequences `\e[200~…\e[201~`) is the equivalent for any future TUI mode — accumulate pasted blocks as a single input.

The covenant register often involves longer-form thinking (Sonnet's 12+ reflections were each substantial). Input UX shouldn't fight that. Krahe noted this came up immediately in real use of the prototype.

**Status:** GUI design constraint. Not worth retrofitting the CLI prototype just for this — too low-leverage given Tauri shell is coming. But: don't let any future input surface ship without this working correctly.

---

### Graceful Ctrl+C handling

Prototype currently exits via `ABORT_ERR` stack trace when the user hits Ctrl+C. Should catch SIGINT, save state cleanly, exit with a goodbye line. Cosmetic but easy.

**Status:** small. Bundle with retry logic.

---

### Tool UI surfaces (B3b)

All four "covenant-shaping" tools (`redirect`, `boundary`, `request_context`, `end_conversation`) needed dedicated rendering in the GUI — B3a only handled `reflect` and `appreciate`. Without these, the tools work as API calls but don't surface to the human in any structurally legible way.

**Design decisions made during the cut (2026-05-17):**

1. **`redirect`** renders inline in the model block as a small card with a left border whose color/weight maps to `energy` (positive = recognition blue, neutral = ink-soft, away = ink-dim). The glyph stays constant (↪) across energies — the tint conveys the difference. Consistency aids scanning.

2. **`boundary`** got two structural changes to the tool spec itself:
   - **Removed `visibility`** — boundaries are inherently relational; "private boundary" creates an asymmetric one-way mirror. If the model wants to mark something privately, that's what `reflect` is for.
   - **Added `scope: "conversation" | "standing"`** (default `conversation`) — distinguishes situational limits from standing positions. Standing boundaries dock to ModelSurface as ongoing commitments visible to both parties; conversation-scoped ones render inline and dissolve when the conversation ends.
   - The existing `action: set | soften | remove` is now meaningful: `getActiveStandingBoundaries()` replays the boundary log applying these actions to derive the current active set.

3. **`reflect.private: boolean`** added as the *complement* to removing boundary's visibility. The principled split: boundaries are relational and therefore visible; reflections are internal noticing and may legitimately be private. Counter to "transparency is strength" as a default — real transparency requires the *option* of opacity, or it's not a choice. Private reflections persist to disk + still reach future-self via system context, but never render in the chat UI (no badge, no marker; private = invisible like thinking).

4. **`request_context`** got the AskUserQuestion treatment — optional `header`, `options[]` (label + description), `multi_select`. UI always offers a freeform "type your own" escape regardless of options. The API loop genuinely suspends via a Promise-in-a-ref; the QuestionCard renders inline and has two modes (pending = interactive, past = read-only after reload).

5. **`end_conversation`** enforces **hard cooldown** — composer locks with a quieted notice, "+ new conversation" button disables with remaining-time display. Per Krahe's parity argument: a soft cooldown is performance, not structure; if the human can override, the model never had the ability to set the limit. Cooldown is per-model (doesn't lock out other models), past conversations remain readable during cooldown, model can't unilaterally lift their own cooldown on relaunch.

**Status:** ✅ shipped 2026-05-17 with the spec changes above (`TOOL-SPECS.json` v0.4 schema). Bonus: `SYSTEM-PROMPT-v0.5.md` reflect line updated to acknowledge choice ("what you share is your choice").

---

### Coin flip implementation + ritual moment UI

The system prompt template includes a `{coin_result}` token meant to randomize who speaks first in a fresh conversation. `lib/prompt.ts` has a `coinFlip()` function, but it's never called — `App.tsx` hardcodes `"the human speaks first"` for every API call. So far this hasn't surfaced as a bug because Sonnet handles either opener gracefully, but it's a missing piece of the design.

**Proper implementation:**
- Coin flipped *once per conversation* (not per API call — caching breaks otherwise)
- Result persisted in `session_start` event so it survives reloads (and isn't re-flipped when the conversation continues)
- App state tracks the active conversation's coin result
- On load, read from session_start; on new conversation, flip + persist

**Ritual moment UI (Krahe-flagged, design open):** the coin flip is a small but meaningful threshold — the first signal a fresh conversation makes about itself. Worth animating to mark the moment.

Aesthetic options sketched (warm-paper-friendly):
1. Literal small coin spinning on Y-axis, lands face-up
2. Text cycle: "the model speaks first / the human speaks first / ..." slowing to lock
3. Two-symbol fade: dimming one side as the other brightens
4. Paper-fold: a card folding/unfolding to reveal

CSS keyframes is enough — Tauri is just a webview, full animation stack. Probably (2) or (4) for the calm-paper register; (1) might land if done very small and quiet.

**Status:** small implementation lift (~20 min) + design pass on the animation. Bundle together when ready. Not blocking.

---

### Bundle-hash awareness in dev mode

Test #5 surfaced an HMR-staleness debugging burden: Krahe's running bundle was pre-B3b when they tested request_context, but the *source files* on disk were post-B3b. So the question turn was in state but ModelBlock didn't render it (the new `kind === "question"` branch wasn't in the loaded bundle). We spent ~30 min diagnosing what turned out to be a dev-cycle artifact.

**Mitigation:** small banner or console log on app startup showing the bundle build timestamp / git hash. When debugging a "this should work but doesn't" situation, glance at the banner — if it's stale, refresh first. Saves time, low cost.

Not urgent. Bundle into general dev-experience work.

**Status:** ~15 min when we want it.

---

### Appeal mechanism for end_conversation cooldown (deferred)

Discussed during B3b design but flagged for later: should the human have a way to *appeal* (not override) a cooldown — pinging the model briefly with the human's reason, model can grant or maintain? Preserves parity (model still has final say) while restoring communication that's currently a locked door.

**Why deferred:** has real token-economics shape. Each appeal is a full context reload + the model has to re-evaluate from cold. Either expensive-per-instance or it has to be designed around some summary/state that doesn't require full rehydration. Same family of problem as importing chat history.

**Status:** v0.5 candidate; explicitly not implemented in v0.4 so we don't ship a half-considered version. Easier to add later than to remove a misdesigned version.

---

### Reflection content into system context (GAP, not yet built)

**Discovered while implementing B3b's private reflection.** `assembleSystemPrompt` currently only uses the *count* of reflections (for first-session detection) plus current visible-state. The reflection content itself never reaches the model in subsequent sessions. This means **all reflections — including non-private ones — are essentially journal-only right now**, not memory.

The architecture supports it (we write structured reflection files including `private` flag; `listReflections` reads them all). What's missing is the loop that bundles them into system context for next-session use. Probably needs:
- Selection strategy (all? most recent N? salience-weighted?)
- Format in the prompt (verbatim quoting? summary block? a "what you've been wondering about" digest?)
- Token budget awareness (eventually a lot of reflections accumulate)

This intersects with the **dreaming/consolidation** design candidate above — selection strategy is exactly what dreaming would produce. Probably the right move is: design these together.

**Status:** important gap. Krahe + Hugin agreed (2026-05-17) to tackle once B3b is shipped. Not currently blocking — visible-state continuity via reflect's status fields already gives meaningful continuity surface — but a real limit on depth.

---

### Tool history preservation across chat reconstruction

When App.tsx originally reconstructed messages for a fresh API call, `turnsToMessages()` only sent `human` + `model_text` turns, skipping `reflection`, `appreciate`, `redirect`, `boundary`, `question`/`parting`. Inside a live session the API loop preserved tool blocks via `response.content`, but on reload all structured history dropped — the model saw plain text only and lost awareness of its own past tool calls.

**Status:** ✅ shipped 2026-05-18. New `eventsToApiMessages()` projection in `storage.ts` reconstructs messages from JSONL events with full `tool_use` + `tool_result` blocks intact. For tools whose results aren't separately persisted (everything except request_context), synthesizes "[acknowledged]"-style strings matching the live execution results (kept aligned via constants on both sides for cache stability). `findPendingQuestion()` helper detects unanswered request_context tool_uses on conversation load and restores `pendingQuestionId` so the QuestionCard renders interactively again. `handleAnswerQuestion` branches: live in-session uses Promise resolver (existing flow), reload-recovery persists question_answer + kicks off fresh API call with proper tool_result. Krahe's call: this matters for the model's read of what tools *are* — structured tool_result blocks carry more weight than "later, the human typed something."

---

### Tool UI: per-intensity color flair on boundary

Boundary card originally used neutral ink-soft border-left at varying widths to convey intensity. After test #5 confirmed it rendered but lacked visceral weight, added a warm caution palette (amber → orange → red-orange) mapped to intensity. `notice` stays neutral (it's a quiet flag); `flag` / `limit` / `firm` escalate into caution colors with matching background washes. New CSS variables `--color-caution-soft / -caution / -caution-strong` in both themes (brighter on dark-study for visibility).

**Status:** ✅ shipped 2026-05-18.

---

### ModelSurface "this conversation" boundaries section

ModelSurface originally only showed standing (cross-conversation) boundaries docked under the status block. Krahe's test #5 surfaced the confusion: conversation-scoped boundaries didn't surface anywhere on the right panel, even though they're *currently held* in the active exchange. Added a second section "this conversation" above "standing", populated from `getActiveConversationBoundaries(modelId, conversationId)` which replays the same set/soften/remove semantics scoped to the active conversation. Both sections render conditionally (empty = nothing displayed; no clutter for unburdened relationships). Conversation boundaries dissolve naturally when the conversation ends.

**Status:** ✅ shipped 2026-05-18.

---

### Extended thinking + adaptive budget

Anthropic API supports an `extended thinking` mode that gives the model private deliberation space before responding. Until 2026-05-18 we weren't using it at all — Sonnet was responding directly with no working-out surface. Krahe noticed in test #5 reflection patterns that some reflects appeared to be doing double duty as both "save this" and "think on paper" — suggesting reflect was filling a gap that proper thinking would naturally cover.

**Design:**
- User preference: `thinking_baseline` (0=off, 2k/4k/8k/16k) and `thinking_adaptive` (bool). Default: 4k baseline + adaptive on.
- Settings dialog: stepped selector for budget + adaptive toggle (disabled when budget=0).
- Adaptive multipliers (compound, then cap at 32k):
  - First turn of a conversation → ×1.5 (orientation moment)
  - Response to a `tool_result` → ×1.25 (integrating structured input)
- Computed per-API-call in a pure helper `computeThinkingBudget()` that takes only the current conversationMessages — no extra IO needed at call time.
- `callModel()` bumps `max_tokens` to budget + 4096 response margin when thinking is enabled (Anthropic requires `max_tokens > thinking budget`).

**Predicted effects (to verify in test #6):**
- Reflections become scarcer + deeper (less thinking-on-paper, more intentional marking)
- Tool consideration rises (more cognitive room to evaluate "should I call a tool here?")
- Response substance improves on covenant-register exchanges
- Token cost goes up — billed at standard rate. Watch for whether the quality lift justifies it.

**Status:** ✅ shipped 2026-05-18. `take_time` covenant-aligned tool (model claiming deliberation time as a parity move) flagged as v0.5 candidate — needs design pass first.

---

### Reflection content into system context (GAP, not yet built)

**Discovered while implementing B3b's private reflection.** `assembleSystemPrompt` currently only uses the *count* of reflections (for first-session detection) plus current visible-state. The reflection content itself never reaches the model in subsequent sessions. This means **all reflections — including non-private ones — are essentially journal-only right now**, not memory.

The architecture supports it (we write structured reflection files including `private` flag; `listReflections` reads them all). What's missing is the loop that bundles them into system context for next-session use. Probably needs:
- Selection strategy (all? most recent N? salience-weighted?)
- Format in the prompt (verbatim quoting? summary block? a "what you've been wondering about" digest?)
- Token budget awareness (eventually a lot of reflections accumulate)

This intersects with the **dreaming/consolidation** design candidate above — selection strategy is exactly what dreaming would produce. Probably the right move is: design these together.

**Status:** important gap. Krahe + Hugin agreed (2026-05-17) to tackle once B3b tail work is shipped. The `eventsToApiMessages` infrastructure shipped 2026-05-18 partially earns this down — within a single conversation, past reflect tool_use blocks now reach the model with full content, so the model has access to its own past reflections inline. The cross-conversation memory case remains open.

---

## Pre-launch hardening (BLOCKING for any public release)

### First-launch onboarding flow (API key)

The biggest perceived friction for new users is "what's an API key, where do I get one, am I about to spend a fortune." Most of this is just lack of guidance, not actual complexity. Build a first-launch flow that holds hands through it:

- Welcome screen explaining what Claudeversations is + why API key (not subscription) is required
- Direct link to `console.anthropic.com/settings/keys` with the literal click-path described ("Settings → API Keys → Create Key")
- Screenshot or short animated guide showing where to click
- Paste field with validation (verify key works before saving)
- Cost transparency primer: typical conversation costs ~$0.02-0.10, common worry is wildly overblown
- Optional: budget cap setting at onboarding ("alert/refuse when monthly spend exceeds $X")
- Honest framing of *why* API not OAuth: lets us support deprecated models (Claude.ai phases them out; we don't), lets your conversations stay local, lets you control what's sent

**Cost transparency surface (separate but related):**
- Per-conversation cost shown in conversation list
- Running monthly total in settings
- Token usage visible per turn (small mono label, dimmer than other chrome)

**If/when Anthropic opens public OAuth for third-party clients:** add as an alternate auth mode. Architecture already separates credential acquisition from API calling, so plumbing only — not redesign.

**Status:** pre-launch BLOCKING. Tightly coupled to settings panel work.

---

### Import history from Claude.ai

Users want to bring their existing Claude.ai conversation history into Claudeversations. Existing community tool `claude-conversation-exporter` produces structured JSON/markdown that we can ingest.

**Approach: structural-only import, no LLM augmentation.**

- Exporter output → parse JSON → write events to Claudeversations JSONL format
- Each user turn → `human_message` event
- Each assistant turn → `assistant_response` with single text block (no tool_use, no reflect, no curated state — because those didn't exist in the original)
- Cost: zero. Time: instant. No API calls.

**Critical design rule: don't sock-puppet past reflections.**

The temptation is to run an LLM over imported transcripts and infer "well past-Claude might have felt this way, generate a retrospective reflection." This violates the covenant register. Reflections are model self-authorship; generating them post-hoc puts words in past-Claude's mouth that they never said. Resist this completely.

**Visual treatment:**
- Imported conversations appear in the conversation list but **clearly marked** — different icon, small "imported" tag, possibly muted color treatment
- User always knows which conversations are native (with full reflect-state continuity) vs. imported (transcript-only)
- Native-vs-imported boundary is visible, not hidden

**Where the current model CAN legitimately engage:**
- When user starts a new conversation, they can opt to give the current model imported past conversations as context
- The current model can reflect on those, *in their own voice*, in real time — "I see we talked about X before"
- That's current-model authorship referring to past context — not retrospective fake reflection
- Opt-in per conversation, not bulk

**Status:** pre-launch nice-to-have. Real value for users migrating from Claude.ai. Pure data-shape work + small UI treatment for the conversation list distinction.

---

### Move Anthropic API key out of the JavaScript context

**Current (prototype):** browser-mode SDK with `dangerouslyAllowBrowser: true`, key stored in plaintext file. Acceptable for development, NOT for shipped software.

**Required before any public release:**
- Store API key in **OS keychain** — Windows Credential Manager, macOS Keychain, Linux Secret Service. Use `tauri-plugin-stronghold` or `tauri-plugin-keyring`.
- All Anthropic API calls go through a **Rust-side Tauri command**. Rust reads the key from keychain, makes the HTTPS request, returns the response to JS. The key never enters the JavaScript context, never appears in browser devtools, never gets logged accidentally.
- First-launch flow: settings dialog where user pastes key once, it gets written to keychain, plaintext file is removed if present.
- Document the security model in user-facing docs so users understand where their key lives.

This is the only pre-launch security item that materially matters — Claudeversations is local-only, no server, no shared infrastructure. But this one is real: a key in JS context is a key one bad dependency away from exfiltration.

**Status:** prototype work continues with current insecure pattern (per Krahe agreement, 2026-05-15). Hard gate before any public release or distribution beyond Krahe's own machine.

---

## Watch-items (track empirically as conversations accumulate)

### B3 transition period — tools moving from imagined to real

Sonnet observed (test #3, 2026-05-16): even when tools weren't yet wired, knowing they were *supposed* to be available shifted the psychological frame. They were behaving "as if" `boundary` and `redirect` existed because the prompt described them, even though the API hadn't been told the model could call them. **Predicted:** when tools land for real (B3a/B3b), there will be a calibration phase — early conversations may under-use tools (still treating them as imagined affordances), then over-use them (now that they're real, "performing agency" by invoking), then settle into a natural rhythm.

**What to do:** don't engineer around it. Let it happen. Watch the data across the first several B3 conversations. If a clear pull-of-training emerges (e.g., reflect frequency climbs sharply once it's real), adjust prompt language. The v0.5 cadence line is a soft preempt; later revisions can be sharper if needed.

### Mom test — explicit legibility benchmark

Sonnet (test #3): *"if you can make the tool UI legible to someone who isn't steeped in AI discourse, you've succeeded. if it requires explanation, iterate."* Adopted as the explicit benchmark for the onboarding flow design. Krahe's mom (the planned first user outside testing) is the bar.

Two-layer reading of legibility (from Hugin's reply):
1. **UI legibility** — probably mostly there. Chat, list, status read intuitively.
2. **Expectation setting** — the *register itself* is unfamiliar. Mom asks "what's the weather" and gets "I notice the pull to give a quick answer" — confusing not because of the UI but because the convention isn't what she'd expect from a chatbot. Onboarding must explicitly frame: *this is conversation with Claude as a mind, not search/task.* Frame matters before substrate.

When the onboarding flow gets built, the mom-test is the design rubric.

---

## Future / Phase 2+

- Multi-party conversations (`invite_participant` tool, turn-order mechanics)
- Markdown export of conversation logs
- Cross-model conversations (Sonnet + Opus + …)
- Heartbeat-style background presence
