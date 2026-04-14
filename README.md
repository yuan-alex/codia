# Codia

A web-based coding agent UI built with Bun, the AI SDK, and React.

## Features

- **Two backends** — Claude Code and a custom Codia Agent using any OpenAI-compatible API
- **Claude Code backend** — spawns `claude --output-format stream-json` per prompt, with session management, history replay, and model switching (Sonnet, Opus, Haiku)
- **Codia Agent backend** — custom coding agent with built-in tools (`ls`, `cat`, `grep`, `edit`, `bash`), powered by Kimi K2 via Fireworks
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
├── agent/            # Codia Agent logic
│   ├── index.ts      # Agent setup, system prompt, model config (Kimi K2)
│   └── tools/        # Tool implementations (bash, cat, edit, grep, ls)
├── server/           # Backend server, API, and session management
│   ├── index.ts      # Bun.serve entry point (WebSocket + REST)
│   ├── backends/     # stream-json and Codia Agent backend implementations
│   └── sensitive-paths.ts
└── web/              # Web UI (React + Vite)
```

## Development

- Run tests: `bun test`
- Run tool tests: `bun test tools.test.ts`
- Run API tests: `bun test src/server/api.test.ts`
- Format code: `bun run format`

## Configuration

Bun loads `.env` automatically.

**Codia Agent backend**:
- `OPENAI_API_BASE_URL` — base URL for the OpenAI-compatible API
- `OPENAI_API_KEY` — API key

**Claude Code backend**:
- Requires the `claude` CLI to be installed and on `PATH`
- `PORT` — server port (default: 1337)

## License

MIT License - see [LICENSE](./LICENSE) for details.