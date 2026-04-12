import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Writable, Readable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import type { AnyMessage } from "@agentclientprotocol/sdk";
import type { ServerWebSocket } from "bun";
import { assertAgentPathAllowed } from "../sensitive-paths";
import type { Backend, SessionResult, PromptResult, SessionListItem } from "./types";
import { sendJson } from "./types";

// ── Debug logging ──────────────────────────────────────────────────

export type AcpLogEntry = {
  ts: number;
  dir: "client→agent" | "agent→client";
  msg: AnyMessage;
};

const acpLog: AcpLogEntry[] = [];
const MAX_LOG = 500;

const debugSubscribers = new Set<ServerWebSocket<any>>();

const DEBUG_ACP = process.env.DEBUG_ACP === "1";
const DEBUG_ACP_VERBOSE = process.env.DEBUG_ACP === "verbose";

function logAcpMessage(dir: AcpLogEntry["dir"], msg: AnyMessage) {
  const entry: AcpLogEntry = { ts: Date.now(), dir, msg };
  acpLog.push(entry);
  if (acpLog.length > MAX_LOG) acpLog.shift();

  if (DEBUG_ACP || DEBUG_ACP_VERBOSE) {
    const method =
      "method" in msg ? msg.method : "result" in msg ? "(response)" : "(error)";
    const id = "id" in msg ? msg.id : undefined;
    if (DEBUG_ACP_VERBOSE) {
      console.log(
        `[acp] ${dir} ${method}${id !== undefined ? ` #${id}` : ""}`,
        JSON.stringify(msg, null, 2),
      );
    } else {
      console.log(
        `[acp] ${dir} ${method}${id !== undefined ? ` #${id}` : ""}`,
      );
    }
  }

  if (debugSubscribers.size > 0) {
    const payload = JSON.stringify({ type: "acp_debug", entry });
    for (const ws of debugSubscribers) {
      try {
        ws.send(payload);
      } catch {}
    }
  }
}

function tappedStream(stream: acp.Stream): acp.Stream {
  const writer = stream.writable.getWriter();
  return {
    readable: stream.readable.pipeThrough(
      new TransformStream<AnyMessage, AnyMessage>({
        transform(msg, controller) {
          logAcpMessage("agent→client", msg);
          controller.enqueue(msg);
        },
      }),
    ),
    writable: new WritableStream<AnyMessage>({
      async write(msg) {
        logAcpMessage("client→agent", msg);
        await writer.write(msg);
      },
      async close() {
        await writer.close();
      },
      abort(reason) {
        return writer.abort(reason);
      },
    }),
  };
}

// ── ACP Backend ───────────────────────────────────────────────────

export class AcpBackend implements Backend {
  private connectionPromise: Promise<acp.ClientSideConnection> | null = null;
  private activeWs: ServerWebSocket<any> | null = null;

  private ensureConnection(): Promise<acp.ClientSideConnection> {
    if (!this.connectionPromise) this.connectionPromise = this.initConnection();
    return this.connectionPromise;
  }

  private async initConnection() {
    const agentProcess = spawn("node_modules/.bin/claude-agent-acp", [], {
      stdio: ["pipe", "pipe", "inherit"],
    });

    const input = Writable.toWeb(agentProcess.stdin!);
    const output = Readable.toWeb(
      agentProcess.stdout!,
    ) as ReadableStream<Uint8Array>;
    const stream = tappedStream(acp.ndJsonStream(input, output));

    const client: acp.Client = {
      requestPermission: async (params) => ({
        outcome: {
          outcome: "selected",
          optionId:
            params.options.find((o) => o.kind === "allow")?.optionId ??
            params.options[0].optionId,
        },
      }),
      sessionUpdate: async (params) => {
        if (this.activeWs) {
          this.activeWs.send(
            JSON.stringify({ type: "update", update: params.update }),
          );
        }
      },
      readTextFile: async (params) => {
        try {
          const filePath = fileURLToPath(params.uri);
          assertAgentPathAllowed(filePath);
          const content = await Bun.file(filePath).text();
          return { content };
        } catch (err) {
          if (err instanceof Error && err.message.startsWith("Access denied")) {
            throw acp.RequestError.invalidParams(err.message);
          }
          throw acp.RequestError.resourceNotFound(params.uri);
        }
      },
      writeTextFile: async (params) => {
        const filePath = fileURLToPath(params.uri);
        assertAgentPathAllowed(filePath);
        await Bun.write(filePath, params.content);
        return {};
      },
    };

    const conn = new acp.ClientSideConnection((_agent) => client, stream);

    await conn.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
      },
      clientInfo: {
        name: "codia",
        title: "Codia",
        version: "0.1.0",
      },
    });

    return conn;
  }

  async warmUp() {
    try {
      await this.ensureConnection();
    } catch (err) {
      console.error("[acp] warm-up failed:", err);
    }
  }

  // ── Backend interface ──────────────────────────────────────────

  async handleNewSession(ws: ServerWebSocket<any>): Promise<SessionResult> {
    const conn = await this.ensureConnection();
    const result = await conn.newSession({
      cwd: process.cwd(),
      mcpServers: [],
    });
    return {
      sessionId: result.sessionId,
      models: result.models?.availableModels ?? [],
      currentModelId: result.models?.currentModelId ?? null,
    };
  }

  async handleLoadSession(
    ws: ServerWebSocket<any>,
    sessionId: string,
  ): Promise<SessionResult> {
    const conn = await this.ensureConnection();
    this.activeWs = ws;
    try {
      const result = await conn.loadSession({
        sessionId,
        cwd: process.cwd(),
        mcpServers: [],
      });
      return {
        sessionId,
        models: result.models?.availableModels ?? [],
        currentModelId: result.models?.currentModelId ?? null,
      };
    } finally {
      this.activeWs = null;
    }
  }

  async handlePrompt(
    ws: ServerWebSocket<any>,
    sessionId: string,
    text: string,
  ): Promise<PromptResult> {
    const conn = await this.ensureConnection();
    this.activeWs = ws;
    try {
      const result = await conn.prompt({
        sessionId,
        prompt: [{ type: "text", text }],
      });
      return {
        stopReason: result.stopReason,
        usage: result.usage,
      };
    } finally {
      this.activeWs = null;
    }
  }

  handleCancel(sessionId: string): void {
    if (!this.connectionPromise) return;
    this.connectionPromise
      .then((conn) => conn.cancel({ sessionId }))
      .catch((err) => console.error("[acp] cancel error:", err));
  }

  async handleSetModel(sessionId: string, modelId: string): Promise<string> {
    const conn = await this.ensureConnection();
    await conn.sendRequest("session/set_model", { sessionId, modelId });
    return modelId;
  }

  async listSessions(): Promise<SessionListItem[]> {
    const conn = await this.ensureConnection();
    const result = await conn.listSessions({ cwd: process.cwd() });
    return (result.sessions ?? []) as SessionListItem[];
  }

  // ── Debug infrastructure ───────────────────────────────────────

  addDebugSubscriber(ws: ServerWebSocket<any>) {
    debugSubscribers.add(ws);
    ws.send(JSON.stringify({ type: "acp_debug_init", log: acpLog }));
  }

  removeDebugSubscriber(ws: ServerWebSocket<any>) {
    debugSubscribers.delete(ws);
  }

  getDebugLog() {
    return acpLog;
  }
}
