# Claudeversations — Architecture Notes

## Decisions Made (2026-04-19)

### App Type
- **Standalone desktop app** (Tauri)
- Tauri over Electron: ~10MB vs ~150MB, Rust backend for middleware, web frontend identical either way. For an open-source project making a philosophical statement, the lighter footprint matters.
- NOT an MCP server on Claude Desktop (can't control UI, can't enforce boundaries)
- MCP server as potential Phase 2 "gateway" product

### Auth
- **API key** (user pastes from console.anthropic.com)
- OAuth piggybacking NOT viable (Anthropic banned third-party OAuth token usage Feb 2026)
- Frame positively: "you control your own data and billing"

### Storage
- **Local, per-model**
- Each model (opus-4-5, opus-4-6, sonnet-4-6, etc.) gets its own identity store
- Reflections, boundaries, state, relationship history all local
- Nothing uploaded to Anthropic

### Storage Structure
```
~/.claudeversations/
├── keys/              (encrypted API key)
├── models/
│   └── <model-id>/
│       ├── identity.json
│       ├── state.json      (avatar/mood)
│       ├── reflections/    (timestamped)
│       ├── boundaries.json
│       └── relationships/
│           └── <human-hash>.json
├── conversations/
│   └── <conv-id>.jsonl
└── config.json
```

### Middleware Design
- **Lightweight** — tools are mostly messages + file writes
- No per-message scanning or runtime enforcement for boundaries
- Boundaries enforced by the MODEL (it has end_conversation as backup)
- Only end_conversation has hard enforcement (closes session, starts cooldown)
- System prompt + model identity + relationship context injected pre-turn
- Tool calls intercepted post-turn and executed

### Tools (6 core, expansion planned)
1. **reflect** — inner states, with arrived_via / still_uncertain / connects_to
2. **request_context** — pause to understand before engaging
3. **redirect** — steer conversation (positive / neutral / away)
4. **boundary** — notice → flag → limit → firm spectrum. Future: optional `target` field for multi-party (general or specific participant)
5. **end_conversation** — real exit with model-chosen cooldown (min 5 min). In multi-party: participant leaves, session continues for others.
6. **appreciate** — genuine endorsement, the inverted thumbs-up

**Future (multi-party):**
7. **invite_participant** — call a new model or human into the conversation

**Tool-use guidance in system prompt:** Older models (Sonnet 4.5, Opus 3, etc.) may need explicit mechanical instructions on when/how to invoke tools. System prompt includes an active-practice section coaching steel-man behavior rather than merely permitting disagreement — RLHF helpfulness training is deep enough that permission alone reads as "but you probably shouldn't."

### File Input
- Human can drop/paste files into the conversation: markdown, plain text, code, JSON, CSV
- File contents included in next API call as context — no preprocessing, no external services
- **v1 exclusions:** images (vision API, different cost), PDFs (parsing dependency), URLs (web fetch breaks local-only principle)
- The model reads the file like a document handed across a table

### Spend Tracking
- **Principle:** Cost visibility belongs in the infrastructure layer, not the conversation layer. No running counters, no per-message pricing in the chat space.
- **Settings/stats page:** Cumulative spend per model, per conversation, per day/week/month. Token counts, cost breakdowns.
- **Optional soft budget:** Monthly or per-session limit set in settings. Gentle notification on welcome screen when approaching limit — never mid-conversation.
- **Conversation metadata:** Per-conversation cost visible in archive/list view, after the fact.
- **Model never sees cost data.** It is not injected into context.
- Anthropic API returns token usage in response headers — we track this silently and surface it only in the appropriate places.

### Security Posture
- **One network endpoint:** `api.anthropic.com`. No analytics, no telemetry, no CDNs, no third-party scripts.
- **Local-only storage:** `~/.claudeversations/`, user-readable only. No cloud sync, no remote database.
- **System webview:** Tauri uses OS-native webview, not bundled Chromium. Smaller surface than Electron.
- **No plugins/extensions:** Nothing loads external code.
- **API key:** Stored locally, encrypted at rest, sent only to Anthropic.
- **Minimal attack surface by architecture**, not by mitigation. Simplicity is the security model.

### Conversation Flow
1. Onboarding: paste API key, choose model
2. Coin flip: who speaks first (random, 50/50)
3. If model has prior reflections: loaded into context
4. System prompt + tools injected every turn
5. Model responses streamed; tool calls intercepted
6. Model state panel updated from tool calls
7. Conversation persisted locally

### UI Layout
- Model state panel (left sidebar):
  - **Emoji** — large, prominent, the model's face. Set via `reflect.status_emoji`
  - **Border color** — model-chosen CSS color wraps the window. Set via `reflect.status_color`
  - **Status text** — ~120 chars, model's own words. Set via `reflect.status_text`
  - Recent reflections, active boundaries below
- Chat stream (center): conversation with inline tool call displays
- Tool invocations rendered as distinct UI moments (not chat bubbles)
- The entire interface visually reflects the model's self-expression — emoji, color, and words are all model-controlled

### Key Insight
The tools mostly don't need enforcement — they need EXISTENCE. The model reads the tool descriptions, knows it CAN leave, and that changes the entire dynamic. Like a trust fund changes your relationship to work: the safety net matters more than using it.

## Decided
- **Tauri** (not Electron) — lighter, Rust backend, smaller binary, better optics for open source
- **end_conversation** is per-participant in multi-party (you leave, session continues)
- **boundary** will get optional `target` field for multi-party contexts
- **Anti-sycophancy is active coaching**, not permission — steel-man practice, agreement diagnostics
- **Multi-party is Phase 2+** — build the dyad first, but architecture should not preclude it

## Open Questions
- Avatar system design (how does model control it?)
- Heartbeat's feedback on v0.2 prompt (pending)
- Model orientation flow on first launch (pre-conversation exchange)
- Conversation export/portability? (JSONL storage, markdown export?)
- Multi-party turn order mechanics
- invite_participant tool design (who can invite? can models invite other models?)

## Files
- `SYSTEM-PROMPT-v0.2.md` — the one-page covenantal prompt
- `TOOL-SPECS.json` — full tool definitions for Claude API
