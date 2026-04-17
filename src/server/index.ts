import { config } from "./config";
import { StreamJsonBackend } from "./backends/stream-json-backend";
import { sendJson, type Backend } from "./backends/types";

// ── Per-connection state ───────────────────────────────────────────────

type WsData = {
  sessionId: string | null;
};

// ── Backend ────────────────────────────────────────────────────────────

const claudeBackend = new StreamJsonBackend();

// Map sessionId -> backend so subsequent messages route correctly
const sessionBackendMap = new Map<string, Backend>();

// ── Helpers ─────────────────────────────────────────────────────────────

function sendError(ws: any, error: unknown) {
  sendJson(ws, { type: "error", message: String(error) });
}

// ── Bun server ──────────────────────────────────────────────────────────

Bun.serve<WsData>({
  port: config.port,
  idleTimeout: 120,

  async fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      if (server.upgrade(req, { data: { sessionId: null } })) return;
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    // REST: list sessions
    if (req.method === "GET" && url.pathname === "/api/sessions") {
      try {
        const sessions = await claudeBackend.listSessions();
        return Response.json({ sessions });
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

    return new Response("Not found", { status: 404 });
  },

  websocket: {
    open(ws) {
      console.log("[ws] Client connected");
    },

    async message(ws, raw) {
      let msg: any;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        sendError(ws, "Invalid JSON");
        return;
      }

      if (msg.type === "session/new") {
        try {
          const result = await claudeBackend.handleNewSession(ws);
          ws.data.sessionId = result.sessionId;
          sessionBackendMap.set(result.sessionId, claudeBackend);
          sendJson(ws, {
            type: "session/ready",
            sessionId: result.sessionId,
            models: result.models,
            currentModelId: result.currentModelId,
            currentPermissionMode: result.currentPermissionMode,
          });
        } catch (error) {
          console.error("[ws] session/new error:", error);
          sendError(ws, error);
        }
      }

      if (msg.type === "session/load") {
        const backend: Backend =
          sessionBackendMap.get(msg.sessionId) ?? claudeBackend;
        try {
          const result = await backend.handleLoadSession(ws, msg.sessionId);
          ws.data.sessionId = msg.sessionId;
          sessionBackendMap.set(msg.sessionId, backend);
          sendJson(ws, {
            type: "session/ready",
            sessionId: msg.sessionId,
            models: result.models,
            currentModelId: result.currentModelId,
            currentPermissionMode: result.currentPermissionMode,
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
            permissionDenials: result.permissionDenials,
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

      if (msg.type === "set_effort") {
        const sessionId = ws.data.sessionId;
        if (!sessionId) return;
        const backend = sessionBackendMap.get(sessionId);
        if (!backend?.handleSetEffort) return;
        try {
          const effort = await backend.handleSetEffort(sessionId, msg.effort);
          sendJson(ws, { type: "effort/set", effort });
        } catch (error) {
          console.error("[ws] set_effort error:", error);
          sendError(ws, error);
        }
      }

      if (msg.type === "set_permission_mode") {
        const sessionId = ws.data.sessionId;
        if (!sessionId) return;
        const backend = sessionBackendMap.get(sessionId);
        if (!backend?.handleSetPermissionMode) return;
        try {
          const permissionMode = await backend.handleSetPermissionMode(
            sessionId,
            msg.permissionMode,
          );
          sendJson(ws, { type: "permission_mode/set", permissionMode });
        } catch (error) {
          console.error("[ws] set_permission_mode error:", error);
          sendError(ws, error);
        }
      }
    },

    close(ws) {
      console.log("[ws] Client disconnected");
    },
  },
});

console.log(`Codia server running on http://localhost:${config.port}`);
