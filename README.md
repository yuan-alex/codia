# Codia

A coding agent that helps users understand and modify their codebases. Available as a terminal UI (TUI) and a web app. Built with Bun, the AI SDK, and React.

## Features

- **Two interfaces** — terminal UI (Ink) and web UI (React + Vite)
- **TUI** — custom coding agent with built-in tools (`ls`, `cat`, `grep`, `edit`, `bash`) using any OpenAI-compatible API
- **Web** — proxies to Claude Code via ACP (Agent Client Protocol), with session management and history replay
- **Session management** — persistent Claude Code sessions with list/load/resume support

## Installation

Prerequisites: [Bun](https://bun.sh/)

```bash
git clone <repo-url>
cd codia
bun install
```

## Usage

### Terminal UI

```bash
bun run dev
```

### Web UI

```bash
bun run web
```

Starts the backend server and Vite dev server concurrently.

## Project Structure

```
src/
├── lib/              # Core agent logic
│   ├── agent.ts      # Agent setup, system prompt, model config
│   ├── config.ts     # Configuration
│   ├── sensitive-paths.ts
│   └── tools/        # Tool implementations (bash, cat, edit, grep, ls)
├── channels/
│   ├── tui/          # Terminal UI (Ink/React)
│   └── web/          # Web UI (React + Vite)
└── server/           # Backend API and session management
```

## Development

- Run tests: `bun test`
- Run tool tests: `bun test tools.test.ts`
- Run API tests: `bun test src/server/api.test.ts`
- Format code: `bun run format`

## Configuration

Bun loads `.env` automatically.

**TUI** (custom agent):
- `OPENAI_API_BASE_URL` — base URL for the OpenAI-compatible API
- `OPENAI_API_KEY` — API key

**Web** (Claude Code proxy):
- Requires `claude-agent-acp` (installed as a dependency)
- `PORT` — server port (default: 1337)

## License

MIT License - see [LICENSE](./LICENSE) for details.