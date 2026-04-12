import type { ServerWebSocket } from "bun";
import type { ModelMessage } from "ai";
import { agent } from "../../agent";
import type { Backend, SessionResult, PromptResult, SessionListItem } from "./types";

// ── Types ─────────────────────────────────────────────────────────

type ToolKind = "read" | "edit" | "search" | "execute" | "other";

type CodiaSession = {
  id: string;
  messages: ModelMessage[];
  abortController: AbortController | null;
  createdAt: number;
  title: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────

function mapToolKind(toolName: string): ToolKind {
  switch (toolName) {
    case "ls":
    case "cat":
    case "grep":
      return "search";
    case "edit":
      return "edit";
    case "bash":
      return "execute";
    default:
      return "other";
  }
}

function toolTitle(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case "ls":
      return `ls ${args.path ?? "."}`;
    case "cat":
      return `cat ${args.filePath ?? ""}`;
    case "grep":
      return `grep "${args.pattern ?? ""}"${args.filePath ? ` ${args.filePath}` : ""}`;
    case "edit":
      return `edit ${args.filePath ?? ""}`;
    case "bash":
      return `bash: ${String(args.command ?? "").slice(0, 60)}`;
    default:
      return toolName;
  }
}

function sendUpdate(ws: ServerWebSocket<any>, update: Record<string, unknown>) {
  ws.send(JSON.stringify({ type: "update", update }));
}

// ── Codia Backend ────────────────────────────────────────────────

export class CodiaBackend implements Backend {
  private sessions = new Map<string, CodiaSession>();

  async handleNewSession(_ws: ServerWebSocket<any>): Promise<SessionResult> {
    const session: CodiaSession = {
      id: crypto.randomUUID(),
      messages: [],
      abortController: null,
      createdAt: Date.now(),
      title: null,
    };
    this.sessions.set(session.id, session);

    return {
      sessionId: session.id,
      models: [
        {
          modelId: "kimi-k2",
          name: "Kimi K2 (Fireworks)",
        },
      ],
      currentModelId: "kimi-k2",
    };
  }

  async handleLoadSession(
    ws: ServerWebSocket<any>,
    sessionId: string,
  ): Promise<SessionResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found (Codia sessions are in-memory only)`);
    }

    // Replay history so the UI renders previous messages
    for (const msg of session.messages) {
      if (msg.role === "user") {
        const text = typeof msg.content === "string"
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content.filter((p: any) => p.type === "text").map((p: any) => p.text).join("")
            : "";
        if (text) {
          sendUpdate(ws, {
            sessionUpdate: "user_message_chunk",
            content: { type: "text", text },
          });
        }
      } else if (msg.role === "assistant") {
        const text = typeof msg.content === "string"
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content.filter((p: any) => p.type === "text").map((p: any) => p.text).join("")
            : "";
        if (text) {
          sendUpdate(ws, {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text },
          });
        }
      }
    }

    return {
      sessionId,
      models: [{ modelId: "kimi-k2", name: "Kimi K2 (Fireworks)" }],
      currentModelId: "kimi-k2",
    };
  }

  async handlePrompt(
    ws: ServerWebSocket<any>,
    sessionId: string,
    text: string,
  ): Promise<PromptResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.messages.push({ role: "user", content: [{ type: "text", text }] });
    session.abortController = new AbortController();

    // Set title from first user message
    if (!session.title) {
      session.title = text.slice(0, 80);
    }

    try {
      const result = await agent.stream({
        prompt: session.messages,
        abortSignal: session.abortController.signal,
      });

      for await (const part of result.fullStream) {
        switch (part.type) {
          case "text-delta":
            sendUpdate(ws, {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: part.text },
            });
            break;

          case "reasoning-delta":
            sendUpdate(ws, {
              sessionUpdate: "agent_thought_chunk",
              content: { type: "text", text: part.text },
            });
            break;

          case "tool-input-start":
            sendUpdate(ws, {
              sessionUpdate: "tool_call",
              toolCallId: part.id,
              title: part.toolName,
              kind: mapToolKind(part.toolName),
              status: "in_progress",
              _meta: { claudeCode: { toolName: part.toolName } },
              rawInput: {},
              content: [],
              locations: [],
            });
            break;

          case "tool-call": {
            // Full tool call is available — update with the complete input
            const input = (part as any).args ?? (part as any).input ?? {};
            sendUpdate(ws, {
              sessionUpdate: "tool_call_update",
              toolCallId: part.toolCallId,
              title: toolTitle(part.toolName, input as Record<string, unknown>),
              rawInput: input,
            });
            break;
          }

          case "tool-result": {
            const output = (part as any).result ?? (part as any).output ?? "";
            sendUpdate(ws, {
              sessionUpdate: "tool_call_update",
              toolCallId: part.toolCallId,
              status: "completed",
              content: [
                {
                  type: "content",
                  content: {
                    type: "text",
                    text: typeof output === "string"
                      ? output
                      : JSON.stringify(output),
                  },
                },
              ],
            });
            break;
          }

          case "error":
            console.error("[codia] Stream error:", part.error);
            break;
        }
      }

      // Append assistant response to session history
      const response = await result.response;
      session.messages.push(...response.messages);

      const usage = await result.totalUsage;
      const finishReason = await result.finishReason;

      return {
        stopReason: finishReason ?? "end_turn",
        usage: usage
          ? {
              inputTokens: usage.inputTokens ?? 0,
              outputTokens: usage.outputTokens ?? 0,
            }
          : undefined,
      };
    } finally {
      session.abortController = null;
    }
  }

  handleCancel(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session?.abortController) {
      session.abortController.abort();
    }
  }

  async listSessions(): Promise<SessionListItem[]> {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((s) => ({
        sessionId: s.id,
        title: s.title ?? undefined,
      }));
  }
}
