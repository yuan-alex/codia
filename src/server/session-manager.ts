import { spawn, type ChildProcess } from "node:child_process";
import { Writable, Readable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";

type Update = acp.SessionNotification["update"];

type Part =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "dynamic-tool"; toolCallId: string; toolName: string; state: string; input: Record<string, unknown>; output?: unknown };

type Message = {
  id: string;
  role: "user" | "assistant";
  parts: Part[];
};

/**
 * Lightweight ACP connection for listing sessions and replaying history.
 */
export class SessionManager {
  private process: ChildProcess | null = null;
  private connection: acp.ClientSideConnection | null = null;
  private replayUpdates: Update[] = [];
  private replaySessionId: string | null = null;

  async connect() {
    const agentProcess = spawn("node_modules/.bin/claude-agent-acp", [], {
      stdio: ["pipe", "pipe", "inherit"],
    });
    this.process = agentProcess;

    const input = Writable.toWeb(agentProcess.stdin!);
    const output = Readable.toWeb(agentProcess.stdout!) as ReadableStream<Uint8Array>;
    const stream = acp.ndJsonStream(input, output);

    const client: acp.Client = {
      requestPermission: async (params) => ({
        outcome: {
          outcome: "selected",
          optionId: params.options.find((o) => o.kind === "allow")?.optionId ?? params.options[0].optionId,
        },
      }),
      sessionUpdate: async (params) => {
        if (this.replaySessionId && params.sessionId === this.replaySessionId) {
          this.replayUpdates.push(params.update);
        }
      },
      readTextFile: async (params) => {
        try {
          const content = await Bun.file(params.uri.replace("file://", "")).text();
          return { content };
        } catch {
          throw acp.RequestError.resourceNotFound(params.uri);
        }
      },
      writeTextFile: async (params) => {
        await Bun.write(params.uri.replace("file://", ""), params.content);
        return {};
      },
    };

    this.connection = new acp.ClientSideConnection((_agent) => client, stream);

    await this.connection.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
      },
      clientInfo: {
        name: "codia-session-manager",
        title: "Codia Session Manager",
        version: "0.1.0",
      },
    });
  }

  async listSessions(cwd: string) {
    if (!this.connection) throw new Error("Not connected");
    const result = await this.connection.listSessions({ cwd });
    return result.sessions ?? [];
  }

  /**
   * Load a session and capture replayed updates, converting them to
   * AI SDK UIMessage format.
   */
  async loadSessionHistory(sessionId: string, cwd: string): Promise<Message[]> {
    if (!this.connection) throw new Error("Not connected");

    this.replayUpdates = [];
    this.replaySessionId = sessionId;

    await this.connection.loadSession({ sessionId, cwd, mcpServers: [] });

    this.replaySessionId = null;
    const updates = this.replayUpdates;
    this.replayUpdates = [];

    return updatesToMessages(updates);
  }

  kill() {
    this.process?.kill();
  }
}

function updatesToMessages(updates: Update[]): Message[] {
  const messages: Message[] = [];
  let currentAssistant: Message | null = null;

  for (const update of updates) {
    const type = (update as any).sessionUpdate;

    if (type === "user_message_chunk") {
      // Finalize any in-progress assistant message
      if (currentAssistant) {
        messages.push(currentAssistant);
        currentAssistant = null;
      }

      const text = (update as any).content?.text;
      if (!text) continue;

      const last = messages[messages.length - 1];
      if (last?.role === "user") {
        const lastPart = last.parts[last.parts.length - 1];
        if (lastPart?.type === "text") {
          lastPart.text += text;
          continue;
        }
      }
      messages.push({
        id: crypto.randomUUID(),
        role: "user",
        parts: [{ type: "text", text }],
      });
    } else if (type === "agent_message_chunk") {
      if (!currentAssistant) {
        currentAssistant = { id: crypto.randomUUID(), role: "assistant", parts: [] };
      }
      const text = (update as any).content?.text;
      if (text) {
        const lastPart = currentAssistant.parts[currentAssistant.parts.length - 1];
        if (lastPart?.type === "text") {
          lastPart.text += text;
        } else {
          currentAssistant.parts.push({ type: "text", text });
        }
      }
    } else if (type === "agent_thought_chunk") {
      if (!currentAssistant) {
        currentAssistant = { id: crypto.randomUUID(), role: "assistant", parts: [] };
      }
      const text = (update as any).content?.text;
      if (text) {
        const lastPart = currentAssistant.parts[currentAssistant.parts.length - 1];
        if (lastPart?.type === "reasoning") {
          lastPart.text += text;
        } else {
          currentAssistant.parts.push({ type: "reasoning", text });
        }
      }
    } else if (type === "tool_call") {
      if (!currentAssistant) {
        currentAssistant = { id: crypto.randomUUID(), role: "assistant", parts: [] };
      }
      currentAssistant.parts.push({
        type: "dynamic-tool",
        toolCallId: (update as any).toolCallId,
        toolName: (update as any).title || "unknown",
        state: "input-available",
        input: {},
      });
    } else if (type === "tool_call_update") {
      if (!currentAssistant) continue;
      const toolPart = currentAssistant.parts.find(
        (p) => p.type === "dynamic-tool" && p.toolCallId === (update as any).toolCallId,
      ) as Extract<Part, { type: "dynamic-tool" }> | undefined;
      if (toolPart) {
        const content = (update as any).content;
        if (content) {
          toolPart.output = content
            .map((c: any) => c.type === "content" && c.content?.type === "text" ? c.content.text : "")
            .filter(Boolean)
            .join("\n");
        }
        toolPart.state = (update as any).status === "completed" ? "output-available" : toolPart.state;
      }
    }
  }

  if (currentAssistant) {
    messages.push(currentAssistant);
  }

  return messages;
}
