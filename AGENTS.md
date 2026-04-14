# Agents

This file provides context for AI coding agents working on this project.

## Overview

Codia is a web-based coding agent UI with two backends:

1. **Claude Code** — spawns `claude --output-format stream-json` per prompt, parses NDJSON events, supports model switching and persistent sessions
2. **Codia Agent** — a custom coding agent with its own tools, powered by Kimi K2 via Fireworks AI

Both backends are accessible through the web UI. The user can switch between them in the sidebar.

## Architecture

- **`src/agent/index.ts`** — Codia Agent definition: model setup (`kimi-k2p5-turbo` via Fireworks), system prompt, tool registration via AI SDK's `ToolLoopAgent`
- **`src/agent/tools/`** — Tool implementations (`bash`, `cat`, `edit`, `grep`, `ls`) used by the Codia Agent
- **`src/server/index.ts`** — Backend server (`Bun.serve`) with WebSocket routing and REST endpoints (`/api/sessions`, `/api/workspace`, `/api/chat`)
- **`src/server/backends/types.ts`** — `Backend` interface and shared WebSocket helpers (`sendJson`, `sendUpdate`)
- **`src/server/backends/stream-json-backend.ts`** — Claude Code backend: spawns `claude --output-format stream-json` per prompt, parses NDJSON events, replays on-disk session history
- **`src/server/backends/codia-backend.ts`** — Codia Agent backend: wraps `ToolLoopAgent`, translates streaming to WebSocket protocol, in-memory session storage
- **`src/server/sensitive-paths.ts`** — Blocks access to `.env` and secret files
- **`src/web/`** — Web frontend built with React and Vite

## Key Conventions

- **Bun only** — use Bun for runtime, package management, testing, and bundling. No Node.js, npm, webpack, or express. See `CLAUDE.md` for full details.
- **AI SDK** — the Codia Agent uses the Vercel AI SDK (`ai` package) with `ToolLoopAgent`.
- **Codia Agent uses Kimi K2** — model is `accounts/fireworks/routers/kimi-k2p5-turbo`; configured via `OPENAI_API_BASE_URL` and `OPENAI_API_KEY` env vars pointing to Fireworks.
- **Claude Code backend key is `"acp"`** — the WebSocket `session/new` message uses `backend: "acp"` to select `StreamJsonBackend`. The name is legacy; it no longer uses ACP.
- **Backend interface** — both backends implement the `Backend` interface in `src/server/backends/types.ts`.
- **Biome** — used for formatting (`bun run format`). No ESLint or Prettier in the root project.
- **No `.env` access** — the agent's tools block reads/writes to `.env` files. Maintain this invariant.

## Testing

```bash
bun test                          # all tests
bun test tools.test.ts            # tool tests
bun test src/server/api.test.ts   # API tests
```

## Common Tasks

- **Adding a new tool**: Create a file in `src/agent/tools/`, export it, and register it in `src/agent/index.ts`.
- **Modifying the system prompt**: Edit the `SYSTEM_PROMPT` constant in `src/agent/index.ts`.
- **Web UI changes**: Work in `src/web/`. Run with `bun run dev`.
- **Adding a new backend**: Implement the `Backend` interface, register it in `src/server/index.ts`.
