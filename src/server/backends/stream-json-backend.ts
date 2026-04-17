import { readFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ServerWebSocket } from "bun";
import {
  type Backend,
  type PromptResult,
  type SessionListItem,
  type SessionResult,
  sendJson,
  sendUpdate,
} from "./types";

// ── Constants ─────────────────────────────────────────────────────────

const MODELS = [
  { modelId: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
  { modelId: "claude-opus-4-7", name: "Claude Opus 4.7" },
  { modelId: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
];

const DEFAULT_MODEL = "claude-sonnet-4-6";

const textEncoder = new TextEncoder();

// ── Types ─────────────────────────────────────────────────────────────

export type EffortLevel = "off" | "low" | "medium" | "high" | "max";
export type PermissionMode =
  | "plan"
  | "default"
  | "acceptEdits"
  | "auto"
  | "dontAsk"
  | "bypassPermissions";

const DEFAULT_PERMISSION_MODE: PermissionMode = "acceptEdits";

type TurnDeferred = {
  ws: ServerWebSocket<any>;
  state: PromptState;
  resolve: (r: PromptResult) => void;
  reject: (e: Error) => void;
};

type Session = {
  id: string;
  claudeSessionId: string | null;
  title: string | null;
  createdAt: number;
  model: string;
  effort: EffortLevel;
  permissionMode: PermissionMode;
  /** Live Claude subprocess for this session (`stdin` is a Bun FileSink for NDJSON turns). */
  proc: ReturnType<typeof Bun.spawn> | null;
  /** Matches last spawned process: model|permission|effort (not claudeSessionId — that appears after init). */
  spawnKey: string;
  currentTurn: TurnDeferred | null;
};

type PromptState = {
  sentTextLen: Map<string, number>;
  seenToolCallIds: Set<string>;
  result: PromptResult;
};

// ── Helpers ───────────────────────────────────────────────────────────

function buildSpawnKey(session: Session): string {
  return `${session.model}|${session.permissionMode}|${session.effort}`;
}

function buildClaudeArgs(session: Session): string[] {
  const args: string[] = [
    "--print",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
    "--model",
    session.model,
    "--permission-mode",
    session.permissionMode,
  ];
  if (session.effort !== "off") {
    args.push("--effort", session.effort);
  }
  if (session.claudeSessionId) {
    args.push("--resume", session.claudeSessionId);
  }
  return args;
}

function mapToolKind(
  name: string,
): "read" | "edit" | "search" | "execute" | "agent" | "other" {
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
    case "Agent":
      return "agent";
    default:
      return "other";
  }
}

function formatToolTitle(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "Read":
      return `Read ${input.file_path ?? ""}`;
    case "Bash":
      return `Bash: ${String(input.command ?? "").slice(0, 60)}`;
    case "Edit":
      return `Edit ${input.file_path ?? ""}`;
    case "Write":
      return `Write ${input.file_path ?? ""}`;
    case "Glob":
      return `Glob ${input.pattern ?? ""}`;
    case "Grep":
      return `Grep "${input.pattern ?? ""}"`;
    case "WebFetch":
      return `Fetch ${input.url ?? ""}`;
    case "WebSearch":
      return `Search "${input.query ?? ""}"`;
    case "Agent":
      return `Agent: ${String(input.description ?? "").slice(0, 60)}`;
    default:
      return name;
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
    sessionUpdate:
      kind === "text" ? "agent_message_chunk" : "agent_thought_chunk",
    content: { type: "text", text: delta },
  });
}

/**
 * Build tool result content blocks from a JSONL entry.
 * If the entry has a `toolUseResult` with structured edit data (filePath,
 * oldString/newString, structuredPatch), emit a diff block so the UI can
 * render it properly. Otherwise fall back to the plain text from the
 * tool_result content.
 */
function buildToolResultContent(entry: any, block: any): unknown[] {
  const tur = entry.toolUseResult;

  // If we have structured edit result data, emit a diff block
  if (
    tur &&
    tur.filePath &&
    (tur.newString != null || tur.oldString != null || tur.structuredPatch)
  ) {
    const content: unknown[] = [
      {
        type: "diff",
        path: tur.filePath,
        oldText: tur.oldString ?? "",
        newText: tur.newString ?? "",
      },
    ];
    // Also include the plain text confirmation as secondary content
    const text = extractToolResultText(block);
    if (text) {
      content.push({ type: "content", content: { type: "text", text } });
    }
    return content;
  }

  // Fallback: plain text only
  const text = extractToolResultText(block);
  return [{ type: "content", content: { type: "text", text } }];
}

/** Extract plain text from a tool_result block's content. */
function extractToolResultText(block: any): string {
  return Array.isArray(block.content)
    ? block.content
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text as string)
        .join("")
    : typeof block.content === "string"
      ? block.content
      : "";
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
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj.type !== "user" || obj.isMeta) continue;

    const content = obj.message?.content;
    if (
      typeof content === "string" &&
      !content.includes("<command-name>") &&
      !content.includes("<local-command")
    ) {
      return content.slice(0, 80);
    }
    if (Array.isArray(content)) {
      const textBlock = content.find((b: any) => b.type === "text" && b.text);
      if (
        textBlock &&
        !textBlock.text.includes("<command-name>") &&
        !textBlock.text.includes("<local-command")
      ) {
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
      effort: "off",
      permissionMode: DEFAULT_PERMISSION_MODE,
      proc: null,
      spawnKey: "",
      currentTurn: null,
    };
    this.sessions.set(session.id, session);
    return {
      sessionId: session.id,
      models: MODELS,
      currentModelId: session.model,
      currentPermissionMode: session.permissionMode,
    };
  }

  async handleLoadSession(
    ws: ServerWebSocket<any>,
    sessionId: string,
  ): Promise<SessionResult> {
    let session = this.sessions.get(sessionId);

    const filePath = join(getSessionsDir(), `${sessionId}.jsonl`);
    const file = Bun.file(filePath);
    const fileExists = await file.exists();

    if (!session) {
      if (!fileExists) throw new Error(`Session ${sessionId} not found`);

      const title = await extractTitle(filePath).catch(() => null);
      session = {
        id: sessionId,
        claudeSessionId: sessionId, // resume from this on-disk session
        title: title ?? null,
        createdAt: Date.now(),
        model: DEFAULT_MODEL,
        effort: "off",
        permissionMode: DEFAULT_PERMISSION_MODE,
        proc: null,
        spawnKey: "",
        currentTurn: null,
      };
      this.sessions.set(sessionId, session);
    }

    // Always replay from disk so the UI gets the full history
    if (fileExists) {
      this.replayHistory(ws, filePath);
    }

    return {
      sessionId,
      models: MODELS,
      currentModelId: session.model,
      currentPermissionMode: session.permissionMode,
    };
  }

  /** Parse on-disk JSONL and send user/assistant text as replay updates. */
  private replayHistory(ws: ServerWebSocket<any>, filePath: string) {
    const raw = readFileSync(filePath, "utf-8") as string;
    const lines = raw.split("\n");

    for (const line of lines) {
      if (!line.trim()) continue;
      let entry: any;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }

      if (entry.type === "user") {
        if (entry.isMeta) continue;
        const content = entry.message?.content;

        const promptId = entry.promptId ?? null;

        // String content = raw user text (may contain XML commands — skip those)
        if (typeof content === "string") {
          if (
            content.includes("<command-name>") ||
            content.includes("<local-command") ||
            content.includes("<system-reminder>")
          )
            continue;
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
              if (
                block.text.includes("<command-name>") ||
                block.text.includes("<local-command") ||
                block.text.includes("<system-reminder>")
              )
                continue;
              sendUpdate(ws, {
                sessionUpdate: "user_message_chunk",
                messageId: promptId,
                content: { type: "text", text: block.text },
              });
            } else if (block.type === "tool_result") {
              const resultContent = buildToolResultContent(entry, block);
              sendUpdate(ws, {
                sessionUpdate: "tool_call_update",
                toolCallId: block.tool_use_id,
                status: block.is_error ? "failed" : "completed",
                content: resultContent,
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
              block.name === "Edit" &&
              input.old_string != null &&
              input.new_string != null
                ? [
                    {
                      type: "diff",
                      path: input.file_path ?? "",
                      oldText: input.old_string,
                      newText: input.new_string,
                    },
                  ]
                : block.name === "Write" && input.content != null
                  ? [
                      {
                        type: "diff",
                        path: input.file_path ?? "",
                        newText: input.content,
                      },
                    ]
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

  /**
   * Stops the Claude subprocess. When `rejectTurn` is true (default), any in-flight
   * prompt is rejected — use false when replacing the process while the same prompt
   * is still being handled (spawnKey / flags changed).
   */
  private async teardownSessionProcess(
    session: Session,
    opts: { rejectTurn?: boolean; reason?: string } = {},
  ): Promise<void> {
    const rejectTurn = opts.rejectTurn ?? true;
    const reason = opts.reason ?? "Session process torn down";

    if (rejectTurn && session.currentTurn) {
      const turn = session.currentTurn;
      session.currentTurn = null;
      turn.reject(new Error(reason));
    }

    if (session.proc?.stdin) {
      try {
        session.proc.stdin.end();
      } catch {
        // ignore
      }
    }

    if (session.proc) {
      try {
        session.proc.kill();
      } catch {
        // ignore
      }
      session.proc = null;
    }

    session.spawnKey = "";
  }

  private async ensureProcess(session: Session): Promise<void> {
    const desiredKey = buildSpawnKey(session);
    if (session.proc && session.spawnKey === desiredKey) {
      return;
    }

    await this.teardownSessionProcess(session, { rejectTurn: false });

    const args = buildClaudeArgs(session);
    console.log(
      "[claude] spawning:",
      ["claude", ...args].join(" ").slice(0, 160),
    );

    const proc = Bun.spawn(["claude", ...args], {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "pipe",
      cwd: process.cwd(),
    });

    session.proc = proc;
    session.spawnKey = desiredKey;

    // Drain stderr progressively to avoid pipe-buffer deadlock on long runs
    void (async () => {
      try {
        for await (const chunk of proc.stderr) {
          if (session.proc !== proc) break;
          const t = new TextDecoder().decode(chunk).trim();
          if (t) console.error("[claude] stderr:", t);
        }
      } catch {
        // ignore
      }
    })();

    void this.runStdoutReader(session, proc);
  }

  private async runStdoutReader(
    session: Session,
    proc: ReturnType<typeof Bun.spawn>,
  ): Promise<void> {
    const stdout = proc.stdout;
    if (!stdout) return;

    const reader = stdout.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    try {
      while (true) {
        if (session.proc !== proc) break;
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let idx = buf.indexOf("\n");
        while (idx !== -1) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line) {
            idx = buf.indexOf("\n");
            continue;
          }
          let event: any;
          try {
            event = JSON.parse(line);
          } catch {
            idx = buf.indexOf("\n");
            continue;
          }

          const turn = session.currentTurn;
          if (turn) {
            sendJson(turn.ws, { type: "debug", event });
            this.processEvent(turn.ws, session, event, turn.state);
          }

          if (event.type === "result" && session.currentTurn) {
            const t = session.currentTurn;
            session.currentTurn = null;
            t.resolve(t.state.result);
          }
          idx = buf.indexOf("\n");
        }
      }

      const trailing = buf.trim();
      if (trailing && session.proc === proc) {
        let event: any;
        try {
          event = JSON.parse(trailing);
        } catch {
          event = null;
        }
        if (event) {
          const turn = session.currentTurn;
          if (turn) {
            sendJson(turn.ws, { type: "debug", event });
            this.processEvent(turn.ws, session, event, turn.state);
          }
          if (event.type === "result" && session.currentTurn) {
            const t = session.currentTurn;
            session.currentTurn = null;
            t.resolve(t.state.result);
          }
        }
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // ignore
      }

      if (session.proc === proc) {
        const exitCode = await proc.exited.catch(() => -1);
        console.log("[claude] exited with code:", exitCode);
        if (session.currentTurn) {
          const t = session.currentTurn;
          session.currentTurn = null;
          t.reject(new Error(`claude process exited (code ${exitCode})`));
        }
        session.proc = null;
        session.spawnKey = "";
      }
    }
  }

  private async writeUserMessage(
    session: Session,
    text: string,
  ): Promise<void> {
    const stdin = session.proc?.stdin;
    if (!stdin || typeof stdin.write !== "function") {
      throw new Error("Claude stdin not available");
    }
    const line = `${JSON.stringify({
      type: "user",
      message: { role: "user", content: text },
    })}\n`;
    stdin.write(textEncoder.encode(line));
  }

  async handlePrompt(
    ws: ServerWebSocket<any>,
    sessionId: string,
    text: string,
  ): Promise<PromptResult> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    if (!session.title) session.title = text.slice(0, 80);

    const state: PromptState = {
      sentTextLen: new Map(),
      seenToolCallIds: new Set(),
      result: { stopReason: "end_turn" },
    };

    const promise = new Promise<PromptResult>((resolve, reject) => {
      session.currentTurn = { ws, state, resolve, reject };
    });

    try {
      await this.ensureProcess(session);
      await this.writeUserMessage(session, text);
    } catch (e) {
      if (session.currentTurn) {
        const t = session.currentTurn;
        session.currentTurn = null;
        t.reject(e instanceof Error ? e : new Error(String(e)));
      }
      throw e;
    }

    return await promise;
  }

  private processEvent(
    ws: ServerWebSocket<any>,
    session: Session,
    event: any,
    state: PromptState,
  ) {
    switch (event.type) {
      case "system": {
        if (
          event.subtype === "init" &&
          event.session_id &&
          !session.claudeSessionId
        ) {
          session.claudeSessionId = event.session_id;
        }
        break;
      }

      case "assistant": {
        const msgId: string = event.message?.id ?? "";
        for (const block of event.message?.content ?? []) {
          if (block.type === "text" && block.text) {
            emitDelta(ws, state.sentTextLen, msgId, "text", block.text);
          } else if (block.type === "thinking" && block.thinking) {
            emitDelta(ws, state.sentTextLen, msgId, "thinking", block.thinking);
          } else if (
            block.type === "tool_use" &&
            !state.seenToolCallIds.has(block.id)
          ) {
            state.seenToolCallIds.add(block.id);
            const input: Record<string, unknown> = block.input ?? {};
            const content: unknown[] =
              block.name === "Edit" &&
              input.old_string != null &&
              input.new_string != null
                ? [
                    {
                      type: "diff",
                      path: input.file_path ?? "",
                      oldText: input.old_string,
                      newText: input.new_string,
                    },
                  ]
                : block.name === "Write" && input.content != null
                  ? [
                      {
                        type: "diff",
                        path: input.file_path ?? "",
                        newText: input.content,
                      },
                    ]
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
        for (const block of event.message?.content ?? []) {
          if (block.type === "tool_result") {
            const resultContent = buildToolResultContent(event, block);
            const isPermissionDenial =
              block.is_error &&
              extractToolResultText(block).includes(
                "Claude requested permissions",
              );
            sendUpdate(ws, {
              sessionUpdate: "tool_call_update",
              toolCallId: block.tool_use_id,
              status: isPermissionDenial
                ? "permission_denied"
                : block.is_error
                  ? "failed"
                  : "completed",
              content: resultContent,
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
        if (
          Array.isArray(event.permission_denials) &&
          event.permission_denials.length > 0
        ) {
          state.result.permissionDenials = event.permission_denials.map(
            (d: any) => ({
              toolName: d.tool_name as string,
              toolUseId: d.tool_use_id as string,
            }),
          );
        }
        break;
      }
    }
  }

  handleCancel(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    const proc = session?.proc;
    const stdin = proc?.stdin;
    if (!proc || !stdin || typeof stdin.write !== "function") {
      proc?.kill();
      return;
    }

    const line =
      JSON.stringify({
        type: "control_request",
        request_id: crypto.randomUUID(),
        request: { subtype: "interrupt" },
      }) + "\n";

    try {
      stdin.write(textEncoder.encode(`${line}\n`));
    } catch {
      try {
        proc.kill();
      } catch {
        // ignore
      }
    }
  }

  async handleSetModel(sessionId: string, modelId: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    session.model = modelId;
    return modelId;
  }

  async handleSetEffort(
    sessionId: string,
    effort: EffortLevel,
  ): Promise<EffortLevel> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    session.effort = effort;
    return effort;
  }

  async handleSetPermissionMode(
    sessionId: string,
    permissionMode: PermissionMode,
  ): Promise<PermissionMode> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    session.permissionMode = permissionMode;
    return permissionMode;
  }

  async listSessions(): Promise<SessionListItem[]> {
    const inMemoryIds = new Set(this.sessions.keys());
    const dir = getSessionsDir();

    // Build in-memory entries with lastUpdated from disk stat
    const inMemory: SessionListItem[] = await Promise.all(
      Array.from(this.sessions.values()).map(async (s) => {
        const filePath = join(dir, `${s.id}.jsonl`);
        const fileStat = await stat(filePath).catch(() => null);
        return {
          sessionId: s.id,
          title: s.title ?? undefined,
          lastUpdated: fileStat?.mtime.toISOString(),
        } as SessionListItem;
      }),
    );

    // Scan on-disk Claude Code sessions for this project
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
    } catch {
      // Directory may not exist yet — that's fine
    }

    const all = [...inMemory, ...diskSessions];
    all.sort((a, b) =>
      (b.lastUpdated ?? "").localeCompare(a.lastUpdated ?? ""),
    );
    return all.slice(0, 50);
  }
}
