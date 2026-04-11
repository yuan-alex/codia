import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Writable, Readable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import type { AnyMessage } from "@agentclientprotocol/sdk";
import { config } from "../lib/config";
import { assertAgentPathAllowed } from "../lib/sensitive-paths";

// ── Per-connection state ───────────────────────────────────────────

type WsData = {
  sessionId: string | null;
};

// ── Debug logging ──────────────────────────────────────────────────

type AcpLogEntry = {
  ts: number;
  dir: "client→agent" | "agent→client";
  msg: AnyMessage;
};

const acpLog: AcpLogEntry[] = [];
const MAX_LOG = 500;
// WebSocket clients subscribed to the debug feed
const debugSubscribers = new Set<any>();

function logAcpMessage(dir: AcpLogEntry["dir"], msg: AnyMessage) {
  const entry: AcpLogEntry = { ts: Date.now(), dir, msg };
  acpLog.push(entry);
  if (acpLog.length > MAX_LOG) acpLog.shift();

  // Console logging
  const method =
    "method" in msg ? msg.method : "result" in msg ? "(response)" : "(error)";
  const id = "id" in msg ? msg.id : undefined;
  console.log(
    `[acp] ${dir} ${method}${id !== undefined ? ` #${id}` : ""}`,
    JSON.stringify(msg, null, 2),
  );

  // Forward to debug subscribers
  const payload = JSON.stringify({ type: "acp_debug", entry });
  for (const ws of debugSubscribers) {
    try {
      ws.send(payload);
    } catch {}
  }
}

/**
 * Wraps an ACP Stream to log all messages in both directions.
 */
function tappedStream(stream: acp.Stream): acp.Stream {
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
        const writer = stream.writable.getWriter();
        await writer.write(msg);
        writer.releaseLock();
      },
      async close() {
        await stream.writable.close();
      },
      abort(reason) {
        stream.writable.abort(reason);
      },
    }),
  };
}

// ── ACP connection (single subprocess) ──────────────────────────────

let connectionPromise: Promise<acp.ClientSideConnection> | null = null;
// Track which WebSocket is actively prompting so we can route notifications
let activeWs: any = null;

function ensureConnection(): Promise<acp.ClientSideConnection> {
  if (!connectionPromise) connectionPromise = initConnection();
  return connectionPromise;
}

async function initConnection() {
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
      if (activeWs) {
        activeWs.send(
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

// ── Helpers ─────────────────────────────────────────────────────────

function sendJson(ws: any, payload: Record<string, unknown>) {
  ws.send(JSON.stringify(payload));
}

function sendError(ws: any, error: unknown) {
  sendJson(ws, { type: "error", message: String(error) });
}

// ── Bun server ──────────────────────────────────────────────────────

Bun.serve<WsData>({
  port: config.port,
  idleTimeout: 120,

  async fetch(req, server) {
    const url = new URL(req.url);

    // Debug WebSocket — streams raw ACP messages to the browser
    if (url.pathname === "/ws/debug") {
      if (server.upgrade(req, { data: { sessionId: "__debug__" } })) return;
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      if (server.upgrade(req, { data: { sessionId: null } })) return;
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    // REST: list sessions
    if (req.method === "GET" && url.pathname === "/api/sessions") {
      try {
        const conn = await ensureConnection();
        const result = await conn.listSessions({ cwd: process.cwd() });
        return Response.json({ sessions: result.sessions ?? [] });
      } catch (error) {
        console.error("Failed to list sessions:", error);
        return Response.json({ error: String(error) }, { status: 500 });
      }
    }

    // REST: workspace info (cwd, repo name, git branch)
    if (req.method === "GET" && url.pathname === "/api/workspace") {
      const cwd = process.cwd();
      const home = process.env.HOME;
      const displayPath =
        home && cwd.startsWith(home) ? "~" + cwd.slice(home.length) : cwd;
      const basename = cwd.split("/").filter(Boolean).pop() ?? cwd;
      let branch: string | null = null;
      try {
        const proc = Bun.spawnSync(
          ["git", "rev-parse", "--abbrev-ref", "HEAD"],
          { cwd, stdout: "pipe", stderr: "ignore" },
        );
        if (proc.exitCode === 0) {
          const out = proc.stdout.toString().trim();
          if (out && out !== "HEAD") branch = out;
        }
      } catch {}
      return Response.json({ cwd, displayPath, basename, branch });
    }

    // REST: debug log history
    if (req.method === "GET" && url.pathname === "/api/debug/log") {
      return Response.json({ log: acpLog });
    }

    return new Response("Not found", { status: 404 });
  },

  websocket: {
    async open(ws) {
      if (ws.data.sessionId === "__debug__") {
        console.log("[ws] Debug client connected");
        debugSubscribers.add(ws);
        // Send existing log as initial payload
        ws.send(JSON.stringify({ type: "acp_debug_init", log: acpLog }));
        return;
      }
      console.log("[ws] Client connected");
    },

    async message(ws, raw) {
      // Debug clients are read-only
      if (ws.data.sessionId === "__debug__") return;
      let msg: any;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        sendError(ws, "Invalid JSON");
        return;
      }

      if (msg.type === "session/new") {
        try {
          const conn = await ensureConnection();
          const result = await conn.newSession({
            cwd: process.cwd(),
            mcpServers: [],
          });
          ws.data.sessionId = result.sessionId;
          sendJson(ws, {
            type: "session/ready",
            sessionId: result.sessionId,
            models: result.models?.availableModels ?? [],
            currentModelId: result.models?.currentModelId ?? null,
          });
        } catch (error) {
          console.error("[ws] session/new error:", error);
          sendError(ws, error);
        }
      }

      if (msg.type === "session/load") {
        try {
          const conn = await ensureConnection();
          activeWs = ws;
          const result = await conn.loadSession({
            sessionId: msg.sessionId,
            cwd: process.cwd(),
            mcpServers: [],
          });
          activeWs = null;
          ws.data.sessionId = msg.sessionId;
          sendJson(ws, {
            type: "session/ready",
            sessionId: msg.sessionId,
            models: result.models?.availableModels ?? [],
            currentModelId: result.models?.currentModelId ?? null,
          });
        } catch (error) {
          activeWs = null;
          console.error("[ws] session/load error:", error);
          sendError(ws, error);
        }
      }

      if (msg.type === "prompt") {
        const sessionId = ws.data.sessionId;
        if (!sessionId) {
          sendError(ws, "No active session");
          return;
        }
        try {
          const conn = await ensureConnection();
          activeWs = ws;
          const result = await conn.prompt({
            sessionId,
            prompt: [{ type: "text", text: msg.text }],
          });
          activeWs = null;
          sendJson(ws, {
            type: "prompt/done",
            stopReason: result.stopReason,
            usage: result.usage,
          });
        } catch (error) {
          activeWs = null;
          console.error("[ws] prompt error:", error);
          sendError(ws, error);
        }
      }

      if (msg.type === "cancel") {
        const sessionId = ws.data.sessionId;
        if (!sessionId || !connectionPromise) return;
        try {
          const conn = await connectionPromise;
          conn.cancel({ sessionId });
        } catch (error) {
          console.error("[ws] cancel error:", error);
        }
      }

      if (msg.type === "set_model") {
        const sessionId = ws.data.sessionId;
        if (!sessionId || !connectionPromise) return;
        try {
          const conn = await connectionPromise;
          await conn.sendRequest("session/set_model", {
            sessionId,
            modelId: msg.modelId,
          });
          sendJson(ws, { type: "model/set", modelId: msg.modelId });
        } catch (error) {
          console.error("[ws] set_model error:", error);
          sendError(ws, error);
        }
      }
    },

    close(ws) {
      if (ws.data.sessionId === "__debug__") {
        console.log("[ws] Debug client disconnected");
        debugSubscribers.delete(ws);
        return;
      }
      console.log("[ws] Client disconnected");
      if (activeWs === ws) activeWs = null;
    },
  },
});

console.log(`Codia server running on http://localhost:${config.port}`);
