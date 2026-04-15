# Agents

This file provides context for AI coding agents working on this project.

## Overview

Codia is a web-based UI for Claude Code. It spawns `claude --output-format stream-json` per prompt, parses NDJSON events, and supports model switching and persistent sessions.

## Architecture

- **`src/server/index.ts`** — Backend server (`Bun.serve`) with WebSocket routing and REST endpoints (`/api/sessions`, `/api/workspace`)
- **`src/server/backends/types.ts`** — `Backend` interface and shared WebSocket helpers (`sendJson`, `sendUpdate`)
- **`src/server/backends/stream-json-backend.ts`** — Claude Code backend: spawns `claude --output-format stream-json` per prompt, parses NDJSON events, replays on-disk session history
- **`src/server/sensitive-paths.ts`** — Blocks access to `.env` and secret files
- **`src/web/`** — Web frontend built with React and Vite

## Key Conventions

- **Bun only** — use Bun for runtime, package management, testing, and bundling. No Node.js, npm, webpack, or express. See `CLAUDE.md` for full details.
- **Backend interface** — backends implement the `Backend` interface in `src/server/backends/types.ts`.
- **Biome** — used for formatting (`bun run format`). No ESLint or Prettier in the root project.

## Testing

```bash
bun test                          # all tests
bun test src/server/api.test.ts   # API tests
```

## Common Tasks

- **Web UI changes**: Work in `src/web/`. Run with `bun run dev`.
- **Adding a new backend**: Implement the `Backend` interface, register it in `src/server/index.ts`.
