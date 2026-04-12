# Agents

This file provides context for AI coding agents working on this project.

## Overview

Codia is a web-based coding agent UI with two backends:

1. **Claude Code (ACP)** — proxies to Claude Code via ACP (Agent Client Protocol) using `claude-agent-acp`
2. **Codia Agent** — a custom coding agent with its own tools, using any OpenAI-compatible API

Both backends are accessible through the web UI. The user can switch between them in the sidebar.

## Architecture

- **`src/agent/index.ts`** — Codia Agent definition: model setup, system prompt, tool registration via AI SDK's `ToolLoopAgent`
- **`src/agent/tools/`** — Tool implementations (`bash`, `cat`, `edit`, `grep`, `ls`) used by the Codia Agent
- **`src/server/index.ts`** — Backend server (`Bun.serve`) that routes WebSocket messages to the appropriate backend
- **`src/server/backends/types.ts`** — Backend interface shared by both backends
- **`src/server/backends/acp-backend.ts`** — ACP backend: proxies to Claude Code via subprocess
- **`src/server/backends/codia-backend.ts`** — Codia Agent backend: wraps `ToolLoopAgent`, translates streaming to WebSocket protocol
- **`src/server/sensitive-paths.ts`** — Blocks access to `.env` and secret files
- **`src/tui/`** — Terminal UI built with Ink (React for the terminal)
- **`src/web/`** — Web frontend built with React and Vite

## Key Conventions

- **Bun only** — use Bun for runtime, package management, testing, and bundling. No Node.js, npm, webpack, or express. See `CLAUDE.md` for full details.
- **AI SDK v6** — the Codia Agent uses the Vercel AI SDK (`ai` package).
- **Codia Agent uses OpenAI-compatible provider** — configured via `OPENAI_API_BASE_URL` and `OPENAI_API_KEY` env vars.
- **Web uses ACP** — proxies to Claude Code via `claude-agent-acp` subprocess.
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
- **TUI changes**: Work in `src/tui/`. Run with `bun run agent-cli`.
- **Adding a new backend**: Implement the `Backend` interface, register it in `src/server/index.ts`.
