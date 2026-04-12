# Codia

A web-based coding agent UI built with Bun, the AI SDK, and React.

## Features

- **Two backends** — Claude Code (via ACP) and a custom Codia Agent using any OpenAI-compatible API
- **Claude Code backend** — proxies to Claude Code via ACP (Agent Client Protocol), with session management and history replay
- **Codia Agent backend** — custom coding agent with built-in tools (`ls`, `cat`, `grep`, `edit`, `bash`)
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
│   ├── index.ts      # Agent setup, system prompt, model config
│   └── tools/        # Tool implementations (bash, cat, edit, grep, ls)
├── server/           # Backend server, API, and session management
│   ├── index.ts      # Bun.serve entry point
│   ├── backends/     # ACP and Codia Agent backend implementations
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
- Requires `claude-agent-acp` (installed as a dependency)
- `PORT` — server port (default: 1337)

## License

MIT License - see [LICENSE](./LICENSE) for details.