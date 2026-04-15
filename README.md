# Codia

A web-based Claude Code UI built with Bun and React.

## Features

- **Claude Code backend** — spawns `claude --output-format stream-json` per prompt, with session management, history replay, and model switching (Sonnet, Opus, Haiku)
- **Session management** — persistent Claude Code sessions with list/load/resume support

## Installation

Prerequisites: [Bun](https://bun.sh/)

```bash
git clone <repo-url>
cd codia
bun install
```

## Usage

```bash
bun run dev
```

Starts the backend server and Vite dev server concurrently.

## Project Structure

```
src/
├── server/           # Backend server, API, and session management
│   ├── index.ts      # Bun.serve entry point (WebSocket + REST)
│   ├── backends/     # stream-json backend implementation
│   └── sensitive-paths.ts
└── web/              # Web UI (React + Vite)
```

## Development

- Run tests: `bun test`
- Run API tests: `bun test src/server/api.test.ts`
- Format code: `bun run format`

## Configuration

Bun loads `.env` automatically.

- Requires the `claude` CLI to be installed and on `PATH`
- `PORT` — server port (default: 1337)

## License

MIT License - see [LICENSE](./LICENSE) for details.
