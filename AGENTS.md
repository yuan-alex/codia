# Agents

This file provides context for AI coding agents working on this project.

## Overview

Codia has two modes:

1. **TUI** — a custom coding agent with its own tools, using any OpenAI-compatible API
2. **Web** — a web UI that proxies to Claude Code via ACP (Agent Client Protocol) using `claude-agent-acp`

The two modes do not share an agent core. The TUI uses a custom agent loop (`src/lib/agent.ts`), while the web backend spawns Claude Code as a subprocess and communicates via ACP.

## Architecture

- **`src/lib/agent.ts`** — Custom agent for the TUI: model setup, system prompt, tool registration, and agentic loop via the AI SDK's `ToolLoopAgent`
- **`src/lib/tools/`** — Tool implementations (`bash`, `cat`, `edit`, `grep`, `ls`) used only by the TUI agent
- **`src/lib/sensitive-paths.ts`** — Blocks access to `.env` and secret files
- **`src/server/`** — Backend API server (`Bun.serve`) that proxies to Claude Code via ACP, with session management and history replay
- **`src/server/session-manager.ts`** — Manages ACP connections for listing/loading Claude Code sessions
- **`src/channels/tui/`** — Terminal UI built with Ink (React for the terminal)
- **`src/channels/web/`** — Web frontend built with React and Vite, talks to the backend server

## Key Conventions

- **Bun only** — use Bun for runtime, package management, testing, and bundling. No Node.js, npm, vite (except the web channel), webpack, or express. See `CLAUDE.md` for full details.
- **AI SDK v6** — both the TUI agent and the web backend use the Vercel AI SDK (`ai` package).
- **TUI uses OpenAI-compatible provider** — configured via `OPENAI_API_BASE_URL` and `OPENAI_API_KEY` env vars.
- **Web uses ACP** — proxies to Claude Code via `claude-agent-acp` subprocess and `@mcpc-tech/acp-ai-provider`.
- **Biome** — used for formatting (`bun run format`). No ESLint or Prettier in the root project.
- **No `.env` access** — the agent's tools block reads/writes to `.env` files. Maintain this invariant.

## Testing

```bash
bun test                          # all tests
bun test tools.test.ts            # tool tests
bun test src/server/api.test.ts   # API tests
```

## Common Tasks

- **Adding a new tool**: Create a file in `src/lib/tools/`, export it, and register it in `src/lib/agent.ts`.
- **Modifying the system prompt**: Edit the `SYSTEM_PROMPT` constant in `src/lib/agent.ts`.
- **Web UI changes**: Work in `src/channels/web/`. Run with `bun run web`.
- **TUI changes**: Work in `src/channels/tui/`. Run with `bun run dev`.
