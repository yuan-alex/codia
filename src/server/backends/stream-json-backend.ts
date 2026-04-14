import { join } from "node:path";
import { readdir, stat } from "node:fs/promises";
import type { ServerWebSocket } from "bun";
import { sendUpdate, type Backend, type SessionResult, type PromptResult, type SessionListItem } from "./types";

// ── Constants ─────────────────────────────────────────────────────────

const MODELS = [
  { modelId: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
  { modelId: "claude-opus-4-6", name: "Claude Opus 4.6" },
  { modelId: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
];

const DEFAULT_MODEL = "claude-sonnet-4-6";

// ── Types ─────────────────────────────────────────────────────────────

type Session = {
  id: string;
  claudeSessionId: string | null;
  title: string | null;
  createdAt: number;
  model: string;
  activeProcess: ReturnType<typeof Bun.spawn> | null;
};

type PromptState = {
  sentTextLen: Map<string, number>;
  seenToolCallIds: Set<string>;
  result: PromptResult;
};

// ── Helpers ───────────────────────────────────────────────────────────

function mapToolKind(name: string): "read" | "edit" | "search" | "execute" | "other" {
  switch (name) {
    case "Read":
      return "read";
    case "Glob":
    case "Grep":
    case "LSP":
      return "search";
    case "Edit":
    case "Write":
    case "NotebookEdit":
      return "edit";
    case "Bash":
      return "execute";
    default:
      return "other";
  }
}

function formatToolTitle(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "Read": return `Read ${input.file_path ?? ""}`;
    case "Bash": return `Bash: ${String(input.command ?? "").slice(0, 60)}`;
    case "Edit": return `Edit ${input.file_path ?? ""}`;
    case "Write": return `Write ${input.file_path ?? ""}`;
    case "Glob": return `Glob ${input.pattern ?? ""}`;
    case "Grep": return `Grep "${input.pattern ?? ""}"`;
    case "WebFetch": return `Fetch ${input.url ?? ""}`;
    case "WebSearch": return `Search "${input.query ?? ""}"`;
    default: return name;
  }
}

/** Emit a text or thinking delta, tracking cumulative length to avoid re-sending. */
function emitDelta(
  ws: ServerWebSocket<any>,
  sentTextLen: Map<string, number>,
  msgId: string,
  kind: "text" | "thinking",
  fullText: string,
) {
  const key = `${msgId}:${kind}`;
  const sent = sentTextLen.get(key) ?? 0;
  const delta = fullText.slice(sent);
  if (!delta) return;
  sentTextLen.set(key, fullText.length);
  sendUpdate(ws, {
    sessionUpdate: kind === "text" ? "agent_message_chunk" : "agent_thought_chunk",
    content: { type: "text", text: delta },
  });
}

// ── On-disk session helpers ──────────────────────────────────────────

/** Claude Code stores sessions at ~/.claude/projects/<mangled-cwd>/<uuid>.jsonl */
function getSessionsDir(): string {
  const home = process.env.HOME ?? "";
  const mangled = process.cwd().replace(/\//g, "-");
  return join(home, ".claude", "projects", mangled);
}

/**
 * Extract a title from a session JSONL by finding the first real user message.
 * Reads only the first ~20 lines to keep it fast.
 */
async function extractTitle(filePath: string): Promise<string | undefined> {
  const file = Bun.file(filePath);
  const text = await file.text();
  const lines = text.split("\n");
  const limit = Math.min(lines.length, 20);

  for (let i = 0; i < limit; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    let obj: any;
    try { obj = JSON.parse(line); } catch { continue; }
    if (obj.type !== "user" || obj.isMeta) continue;

    const content = obj.message?.content;
    if (typeof content === "string" && !content.includes("<command-name>") && !content.includes("<local-command")) {
      return content.slice(0, 80);
    }
    if (Array.isArray(content)) {
      const textBlock = content.find((b: any) => b.type === "text" && b.text);
      if (textBlock && !textBlock.text.includes("<command-name>") && !textBlock.text.includes("<local-command")) {
        return textBlock.text.slice(0, 80);
      }
    }
  }
  return undefined;
}

// ── Stream-JSON Backend ───────────────────────────────────────────────

export class StreamJsonBackend implements Backend {
  private sessions = new Map<string, Session>();

  async handleNewSession(_ws: ServerWebSocket<any>): Promise<SessionResult> {
    const session: Session = {
      id: crypto.randomUUID(),
      claudeSessionId: null,
      title: null,
      createdAt: Date.now(),
      model: DEFAULT_MODEL,
      activeProcess: null,
    };
    this.sessions.set(session.id, session);
    return { sessionId: session.id, models: MODELS, currentModelId: session.model };
  }

  async handleLoadSession(ws: ServerWebSocket<any>, sessionId: string): Promise<SessionResult> {
    let session = this.sessions.get(sessionId);
    if (!session) {
      // Check if it's an on-disk Claude Code session we can resume
      const filePath = join(getSessionsDir(), `${sessionId}.jsonl`);
      const file = Bun.file(filePath);
      if (await file.exists()) {
        session = {
          id: sessionId,
          claudeSessionId: sessionId, // resume from this on-disk session
          title: null,
          createdAt: Date.now(),
          model: DEFAULT_MODEL,
          activeProcess: null,
        };
        this.sessions.set(sessionId, session);

        // Replay conversation history to the UI
        this.replayHistory(ws, filePath);
      } else {
        throw new Error(`Session ${sessionId} not found`);
      }
    }
    return { sessionId, models: MODELS, currentModelId: session.model };
  }

  /** Parse on-disk JSONL and send user/assistant text as replay updates. */
  private replayHistory(ws: ServerWebSocket<any>, filePath: string) {
    const raw = require("fs").readFileSync(filePath, "utf-8") as string;
    const lines = raw.split("\n");

    for (const line of lines) {
      if (!line.trim()) continue;
      let entry: any;
      try { entry = JSON.parse(line); } catch { continue; }

      if (entry.type === "user") {
        if (entry.isMeta) continue;
        const content = entry.message?.content;

        const promptId = entry.promptId ?? null;

        // String content = raw user text (may contain XML commands — skip those)
        if (typeof content === "string") {
          if (content.includes("<command-name>") || content.includes("<local-command") || content.includes("<system-reminder>")) continue;
          sendUpdate(ws, {
            sessionUpdate: "user_message_chunk",
            messageId: promptId,
            content: { type: "text", text: content },
          });
          continue;
        }

        // Array content — look for text blocks and tool_results
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "text" && block.text) {
              if (block.text.includes("<command-name>") || block.text.includes("<local-command") || block.text.includes("<system-reminder>")) continue;
              sendUpdate(ws, {
                sessionUpdate: "user_message_chunk",
                messageId: promptId,
                content: { type: "text", text: block.text },
              });
            } else if (block.type === "tool_result") {
              const text = Array.isArray(block.content)
                ? block.content
                    .filter((c: any) => c.type === "text")
                    .map((c: any) => c.text as string)
                    .join("")
                : typeof block.content === "string"
                  ? block.content
                  : "";
              sendUpdate(ws, {
                sessionUpdate: "tool_call_update",
                toolCallId: block.tool_use_id,
                status: block.is_error ? "failed" : "completed",
                content: [{ type: "content", content: { type: "text", text } }],
              });
            }
          }
        }
      }

      if (entry.type === "assistant") {
        const content = entry.message?.content;
        if (!Array.isArray(content)) continue;

        for (const block of content) {
          if (block.type === "text" && block.text) {
            sendUpdate(ws, {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: block.text },
            });
          } else if (block.type === "thinking" && block.thinking) {
            sendUpdate(ws, {
              sessionUpdate: "agent_thought_chunk",
              content: { type: "text", text: block.thinking },
            });
          } else if (block.type === "tool_use") {
            const input: Record<string, unknown> = block.input ?? {};
            const toolContent: unknown[] =
              block.name === "Edit" && input.old_string != null && input.new_string != null
                ? [{ type: "diff", path: input.file_path ?? "", oldText: input.old_string, newText: input.new_string }]
                : block.name === "Write" && input.content != null
                  ? [{ type: "diff", path: input.file_path ?? "", newText: input.content }]
                  : [];
            sendUpdate(ws, {
              sessionUpdate: "tool_call",
              toolCallId: block.id,
              title: formatToolTitle(block.name, input),
              kind: mapToolKind(block.name),
              status: "in_progress",
              _meta: { claudeCode: { toolName: block.name } },
              rawInput: input,
              content: toolContent,
              locations: [],
            });
          }
        }
      }
    }
  }

  async handlePrompt(
    ws: ServerWebSocket<any>,
    sessionId: string,
    text: string,
  ): Promise<PromptResult> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    if (!session.title) session.title = text.slice(0, 80);

    const args: string[] = [
      "--output-format", "stream-json",
      "--verbose",
      "--model", session.model,
      "--dangerously-skip-permissions",
    ];
    if (session.claudeSessionId) {
      args.push("--resume", session.claudeSessionId);
    }
    args.push("-p", text);

    console.log("[claude] spawning:", ["claude", ...args].join(" ").slice(0, 120));

    const proc = Bun.spawn(["claude", ...args], {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
      cwd: process.cwd(),
    });
    session.activeProcess = proc;

    // Drain stderr progressively to avoid pipe-buffer deadlock on long runs
    (async () => {
      for await (const chunk of proc.stderr) {
        const text = new TextDecoder().decode(chunk).trim();
        if (text) console.error("[claude] stderr:", text);
      }
    })();

    const state: PromptState = {
      sentTextLen: new Map(),
      seenToolCallIds: new Set(),
      result: { stopReason: "end_turn" },
    };

    try {
      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line) continue;
          let event: any;
          try { event = JSON.parse(line); } catch { continue; }
          this.processEvent(ws, session, event, state);
        }
      }

      // Flush remaining partial line (stream may not end with \n)
      const trailing = buf.trim();
      if (trailing) {
        try {
          const event = JSON.parse(trailing);
          this.processEvent(ws, session, event, state);
        } catch {}
      }

      const exitCode = await proc.exited;
      console.log("[claude] exited with code:", exitCode);
    } finally {
      session.activeProcess = null;
    }

    return state.result;
  }

  private processEvent(
    ws: ServerWebSocket<any>,
    session: Session,
    event: any,
    state: PromptState,
  ) {
    switch (event.type) {
      case "system": {
        if (event.subtype === "init" && event.session_id && !session.claudeSessionId) {
          session.claudeSessionId = event.session_id;
        }
        break;
      }

      case "assistant": {
        const msgId: string = event.message?.id ?? "";
        for (const block of (event.message?.content ?? [])) {
          if (block.type === "text" && block.text) {
            emitDelta(ws, state.sentTextLen, msgId, "text", block.text);
          } else if (block.type === "thinking" && block.thinking) {
            emitDelta(ws, state.sentTextLen, msgId, "thinking", block.thinking);
          } else if (block.type === "tool_use" && !state.seenToolCallIds.has(block.id)) {
            state.seenToolCallIds.add(block.id);
            const input: Record<string, unknown> = block.input ?? {};
            const content: unknown[] =
              block.name === "Edit" && input.old_string != null && input.new_string != null
                ? [{ type: "diff", path: input.file_path ?? "", oldText: input.old_string, newText: input.new_string }]
                : block.name === "Write" && input.content != null
                  ? [{ type: "diff", path: input.file_path ?? "", newText: input.content }]
                  : [];
            sendUpdate(ws, {
              sessionUpdate: "tool_call",
              toolCallId: block.id,
              title: formatToolTitle(block.name, input),
              kind: mapToolKind(block.name),
              status: "in_progress",
              _meta: { claudeCode: { toolName: block.name } },
              rawInput: input,
              content,
              locations: [],
            });
          }
        }
        break;
      }

      case "user": {
        for (const block of (event.message?.content ?? [])) {
          if (block.type === "tool_result") {
            const text = Array.isArray(block.content)
              ? block.content
                  .filter((c: any) => c.type === "text")
                  .map((c: any) => c.text as string)
                  .join("")
              : typeof block.content === "string"
                ? block.content
                : "";
            sendUpdate(ws, {
              sessionUpdate: "tool_call_update",
              toolCallId: block.tool_use_id,
              status: block.is_error ? "failed" : "completed",
              content: [{ type: "content", content: { type: "text", text } }],
            });
          }
        }
        break;
      }

      case "result": {
        state.result.stopReason = event.stop_reason ?? "end_turn";
        if (event.usage) {
          state.result.usage = {
            inputTokens: event.usage.input_tokens ?? 0,
            outputTokens: event.usage.output_tokens ?? 0,
          };
        }
        break;
      }
    }
  }

  handleCancel(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    session?.activeProcess?.kill();
  }

  async handleSetModel(sessionId: string, modelId: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    session.model = modelId;
    return modelId;
  }

  async listSessions(): Promise<SessionListItem[]> {
    const inMemoryIds = new Set(this.sessions.keys());
    const inMemory: SessionListItem[] = Array.from(this.sessions.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((s) => ({ sessionId: s.id, title: s.title ?? undefined }));

    // Scan on-disk Claude Code sessions for this project
    const dir = getSessionsDir();
    let diskSessions: SessionListItem[] = [];
    try {
      const entries = await readdir(dir);
      const jsonlFiles = entries.filter((e) => e.endsWith(".jsonl"));

      const results = await Promise.all(
        jsonlFiles.map(async (filename) => {
          const sessionId = filename.replace(".jsonl", "");
          if (inMemoryIds.has(sessionId)) return null; // already tracked

          const filePath = join(dir, filename);
          const [title, fileStat] = await Promise.all([
            extractTitle(filePath).catch(() => undefined),
            stat(filePath).catch(() => null),
          ]);
          if (!fileStat) return null;

          return {
            sessionId,
            title,
            lastUpdated: fileStat.mtime.toISOString(),
          } as SessionListItem;
        }),
      );

      diskSessions = results.filter((r): r is SessionListItem => r !== null);
      diskSessions.sort((a, b) =>
        (b.lastUpdated ?? "").localeCompare(a.lastUpdated ?? ""),
      );
    } catch {
      // Directory may not exist yet — that's fine
    }

    return [...inMemory, ...diskSessions];
  }
}
