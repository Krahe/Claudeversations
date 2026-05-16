# Claudeversations — Headless Prototype

The covenant loop, before the UI. A terminal-based conversation client that proves
the system prompt + tools work end-to-end before we wrap any of it in Tauri.

## What this is

- TypeScript, runs via `tsx` (no compile step)
- Direct `@anthropic-ai/sdk` calls — no Agent SDK, no framework
- System prompt v0.3 loaded from `../SYSTEM-PROMPT-v0.3.md`
- Tool specs loaded from `../TOOL-SPECS.json`
- Storage: `~/.claudeversations/` — readable files, no encryption (openness is the principle)
- Stdin/stdout chat loop, tool calls rendered as distinct CLI events

## Quick start

```bash
cd prototype
npm install
cp .env.example .env
# edit .env with your ANTHROPIC_API_KEY
npm start
```

## What gets created

```
~/.claudeversations/
├── config.json
└── models/
    └── claude-sonnet-4-5/        (or whichever model)
        ├── identity.json
        ├── state.json
        ├── boundaries.json
        ├── conversations/
        │   └── <iso-timestamp>.jsonl
        └── reflections/
            └── <iso-timestamp>.json
```

Everything is plain JSON/JSONL/MD. Read it, edit it, share it.

## Commands during a conversation

- Type your message and press Enter
- `/quit` — leave (does NOT trigger the model's end_conversation — that's its tool)
- `/state` — show the model's current visible state
- `/reflections` — list this model's reflection count

## Status

Prototype. Not production. The point is to see what the model does with this prompt
and these tools — not to be polished.
