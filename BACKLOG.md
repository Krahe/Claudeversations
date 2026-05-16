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

**Status:** v0.4 affordance. Bundle with text-size settings work — same plumbing.

---

### Text size / accessibility settings

User-configurable text size (and potentially line spacing, font choice) under app preferences. Krahe noted: large monitor + reduced eyesight, wants larger body text comfortably. Real accessibility need, not just preference — anyone reading sustained substrate-density prose benefits from font-size control.

**Implementation shape:**
- Settings panel accessible via the ⚙ icon in top bar
- Slider or stepped sizes (small / medium / large / xl)
- Persists to local config file alongside other preferences
- Affects body text and reflection text proportionally; chrome (mono labels) stays at fixed size
- CSS variables (`--body-size`, `--reflect-size`) on `:root` updated from React state — Tailwind classes use those vars

**Status:** v0.4 affordance. Not blocking the avatar/chat work but worth shipping with first GUI release. Cheap to add once a settings panel exists.

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

## Pre-launch hardening (BLOCKING for any public release)

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

## Future / Phase 2+

- Multi-party conversations (`invite_participant` tool, turn-order mechanics)
- Markdown export of conversation logs
- Cross-model conversations (Sonnet + Opus + …)
- Heartbeat-style background presence
