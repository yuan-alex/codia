import { createACPProvider, type ACPProvider } from "@mcpc-tech/acp-ai-provider";
import { streamText, convertToModelMessages } from "ai";
import { SessionManager } from "./session-manager";

const PORT = Number(process.env.PORT) || 1337;

const sessionManager = new SessionManager();
let sessionManagerReady = false;

async function ensureSessionManager() {
  if (sessionManagerReady) return;
  await sessionManager.connect();
  sessionManagerReady = true;
}

function makeProvider(existingSessionId?: string) {
  return createACPProvider({
    command: "node_modules/.bin/claude-agent-acp",
    session: {
      cwd: process.cwd(),
      mcpServers: [],
    },
    persistSession: true,
    existingSessionId,
  });
}

// Active chat provider — pre-connect on startup so first session is fast
let provider: ACPProvider = makeProvider();
let sessionInfo: Awaited<ReturnType<ACPProvider["initSession"]>> | null = null;

async function switchSession(existingSessionId?: string) {
  provider.cleanup();
  provider = makeProvider(existingSessionId);
  sessionInfo = await provider.initSession();
  return sessionInfo;
}

// Pre-connect both on startup
Promise.all([
  ensureSessionManager().then(() => console.log("Session manager connected")),
  provider.initSession().then((info) => {
    sessionInfo = info;
    console.log("Chat provider ready");
  }),
]).catch((err) => {
  console.error("Startup connection error:", err);
});

Bun.serve({
  port: PORT,
  idleTimeout: 120,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // GET /api/sessions — list past sessions
    if (req.method === "GET" && path === "/api/sessions") {
      try {
        await ensureSessionManager();
        const sessions = await sessionManager.listSessions(process.cwd());
        return Response.json({ sessions });
      } catch (error) {
        console.error("Failed to list sessions:", error);
        return Response.json({ error: String(error) }, { status: 500 });
      }
    }

    // POST /api/session/new — create a new session
    if (req.method === "POST" && path === "/api/session/new") {
      try {
        // If we already have a pre-initialized session with no prompts, reuse it
        if (sessionInfo && provider.getSessionId()) {
          return Response.json({
            sessionId: provider.getSessionId(),
            models: sessionInfo.models?.availableModels ?? [],
            modes: sessionInfo.modes?.availableModes ?? [],
            currentModelId: sessionInfo.models?.currentModelId ?? null,
            currentModeId: sessionInfo.modes?.currentModeId ?? null,
          });
        }
        const info = await switchSession();
        return Response.json({
          sessionId: provider.getSessionId(),
          models: info.models?.availableModels ?? [],
          modes: info.modes?.availableModes ?? [],
          currentModelId: info.models?.currentModelId ?? null,
          currentModeId: info.modes?.currentModeId ?? null,
        });
      } catch (error) {
        console.error("Failed to create session:", error);
        return Response.json({ error: String(error) }, { status: 500 });
      }
    }

    // POST /api/session/load — load an existing session with history
    if (req.method === "POST" && path === "/api/session/load") {
      try {
        const { sessionId } = await req.json<{ sessionId: string }>();
        await ensureSessionManager();

        // Load history and switch provider in parallel
        const [history, info] = await Promise.all([
          sessionManager.loadSessionHistory(sessionId, process.cwd()),
          switchSession(sessionId),
        ]);

        return Response.json({
          sessionId: provider.getSessionId(),
          models: info.models?.availableModels ?? [],
          modes: info.modes?.availableModes ?? [],
          currentModelId: info.models?.currentModelId ?? null,
          currentModeId: info.modes?.currentModeId ?? null,
          history,
        });
      } catch (error) {
        console.error("Failed to load session:", error);
        return Response.json({ error: String(error) }, { status: 500 });
      }
    }

    // POST /api/model — set model
    if (req.method === "POST" && path === "/api/model") {
      if (!sessionInfo) return Response.json({ error: "No active session" }, { status: 400 });
      const { modelId } = await req.json<{ modelId: string }>();
      await provider.setModel(modelId);
      return Response.json({ ok: true });
    }

    // POST /api/chat — AI SDK UI message stream
    if (req.method === "POST" && path === "/api/chat") {
      if (!sessionInfo) return Response.json({ error: "No active session" }, { status: 400 });

      const { messages } = await req.json();

      // ACP session holds full conversation history internally.
      // Only forward the last user message to avoid tool-call/result
      // mismatch errors from convertToModelMessages.
      const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user");
      const toSend = lastUserMsg ? [lastUserMsg] : messages;

      const result = streamText({
        model: provider.languageModel(),
        messages: await convertToModelMessages(toSend),
        tools: provider.tools,
      });

      return result.toUIMessageStreamResponse();
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`Codia server running on http://localhost:${PORT}`);
