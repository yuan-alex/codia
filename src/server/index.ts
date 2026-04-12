import { createAgentUIStreamResponse } from "ai";
import { config } from "./config";
import { AcpBackend } from "./backends/acp-backend";
import { CodiaBackend } from "./backends/codia-backend";
import type { Backend } from "./backends/types";
import { agent } from "../agent";

// ── Per-connection state ───────────────────────────────────────────

type WsData = {
  sessionId: string | null;
};

// ── Backends ───────────────────────────────────────────────────────

const acpBackend = new AcpBackend();
const codiaBackend = new CodiaBackend();

const backends: Record<string, Backend> = {
  acp: acpBackend,
  codia: codiaBackend,
};

// Map sessionId -> backend so subsequent messages route correctly
const sessionBackendMap = new Map<string, Backend>();

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

    // REST: list sessions (merge both backends)
    if (req.method === "GET" && url.pathname === "/api/sessions") {
      try {
        const [acpSessions, codiaSessions] = await Promise.all([
          acpBackend.listSessions().catch(() => []),
          codiaBackend.listSessions().catch(() => []),
        ]);
        return Response.json({
          sessions: [
            ...acpSessions.map((s) => ({ ...s, backend: "acp" })),
            ...codiaSessions.map((s) => ({ ...s, backend: "codia" })),
          ],
        });
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
      return Response.json({ log: acpBackend.getDebugLog() });
    }

    // REST: AI SDK chat endpoint (used by the TUI via DefaultChatTransport)
    if (req.method === "POST" && url.pathname === "/api/chat") {
      const body = await req.json();
      return createAgentUIStreamResponse({
        agent,
        uiMessages: body.messages ?? [],
      });
    }

    return new Response("Not found", { status: 404 });
  },

  websocket: {
    async open(ws) {
      if (ws.data.sessionId === "__debug__") {
        console.log("[ws] Debug client connected");
        acpBackend.addDebugSubscriber(ws);
        return;
      }
      console.log("[ws] Client connected");
    },

    async message(ws, raw) {
      if (ws.data.sessionId === "__debug__") return;

      let msg: any;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        sendError(ws, "Invalid JSON");
        return;
      }

      if (msg.type === "session/new") {
        const backendKey = msg.backend ?? "acp";
        const backend = backends[backendKey];
        if (!backend) {
          sendError(ws, `Unknown backend: ${backendKey}`);
          return;
        }
        try {
          const result = await backend.handleNewSession(ws);
          ws.data.sessionId = result.sessionId;
          sessionBackendMap.set(result.sessionId, backend);
          sendJson(ws, {
            type: "session/ready",
            sessionId: result.sessionId,
            models: result.models,
            currentModelId: result.currentModelId,
          });
        } catch (error) {
          console.error("[ws] session/new error:", error);
          sendError(ws, error);
        }
      }

      if (msg.type === "session/load") {
        // Try both backends to find the session
        let backend: Backend | undefined = sessionBackendMap.get(msg.sessionId);
        if (!backend) {
          // Default to ACP for sessions we haven't tracked (e.g. from a previous server run)
          backend = acpBackend;
        }
        try {
          const result = await backend.handleLoadSession(ws, msg.sessionId);
          ws.data.sessionId = msg.sessionId;
          sessionBackendMap.set(msg.sessionId, backend);
          sendJson(ws, {
            type: "session/ready",
            sessionId: msg.sessionId,
            models: result.models,
            currentModelId: result.currentModelId,
          });
        } catch (error) {
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
        const backend = sessionBackendMap.get(sessionId);
        if (!backend) {
          sendError(ws, "No backend for session");
          return;
        }
        try {
          const result = await backend.handlePrompt(ws, sessionId, msg.text);
          sendJson(ws, {
            type: "prompt/done",
            stopReason: result.stopReason,
            usage: result.usage,
          });
        } catch (error) {
          console.error("[ws] prompt error:", error);
          sendError(ws, error);
        }
      }

      if (msg.type === "cancel") {
        const sessionId = ws.data.sessionId;
        if (!sessionId) return;
        const backend = sessionBackendMap.get(sessionId);
        if (!backend) return;
        try {
          backend.handleCancel(sessionId);
        } catch (error) {
          console.error("[ws] cancel error:", error);
        }
      }

      if (msg.type === "set_model") {
        const sessionId = ws.data.sessionId;
        if (!sessionId) return;
        const backend = sessionBackendMap.get(sessionId);
        if (!backend?.handleSetModel) return;
        try {
          const modelId = await backend.handleSetModel(sessionId, msg.modelId);
          sendJson(ws, { type: "model/set", modelId });
        } catch (error) {
          console.error("[ws] set_model error:", error);
          sendError(ws, error);
        }
      }
    },

    close(ws) {
      if (ws.data.sessionId === "__debug__") {
        console.log("[ws] Debug client disconnected");
        acpBackend.removeDebugSubscriber(ws);
        return;
      }
      console.log("[ws] Client disconnected");
    },
  },
});

console.log(`Codia server running on http://localhost:${config.port}`);

// Warm up the ACP subprocess
acpBackend.warmUp();
