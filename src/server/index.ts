import { ACPClient, type SessionUpdate } from "./acp-client";

const PORT = Number(process.env.PORT) || 1337;

const acpClient = new ACPClient();
let connected = false;

const sseControllers = new Map<string, Set<ReadableStreamDefaultController>>();

function broadcastUpdate(sessionId: string, update: SessionUpdate) {
  const controllers = sseControllers.get(sessionId);
  if (!controllers) return;

  const data = JSON.stringify(update);
  const message = `data: ${data}\n\n`;
  const encoded = new TextEncoder().encode(message);

  for (const controller of controllers) {
    try {
      controller.enqueue(encoded);
    } catch {
      controllers.delete(controller);
    }
  }
}

async function ensureConnected() {
  if (connected) return;
  await acpClient.connect((sessionId, update) => {
    broadcastUpdate(sessionId, update);
  });
  connected = true;
}

// POST /api/session — create a new session
async function handleNewSession(req: Request): Promise<Response> {
  try {
    await ensureConnected();
    const { cwd } = await req.json<{ cwd?: string }>();
    const session = await acpClient.newSession(cwd || process.cwd());

    sseControllers.set(session.sessionId, new Set());

    return Response.json({
      sessionId: session.sessionId,
      configOptions: session.configOptions,
    });
  } catch (error) {
    console.error("Failed to create session:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

// GET /api/sessions — list existing sessions
async function handleListSessions(req: Request): Promise<Response> {
  try {
    await ensureConnected();
    const url = new URL(req.url);
    const cwd = url.searchParams.get("cwd") || process.cwd();
    const sessions = await acpClient.listSessions(cwd);
    return Response.json({ sessions });
  } catch (error) {
    console.error("Failed to list sessions:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

// POST /api/session/load — load an existing session
async function handleLoadSession(req: Request): Promise<Response> {
  try {
    await ensureConnected();
    const { sessionId, cwd } = await req.json<{
      sessionId: string;
      cwd?: string;
    }>();

    // Ensure SSE controller set exists before loading, since replay
    // broadcasts updates immediately during loadSession
    if (!sseControllers.has(sessionId)) {
      sseControllers.set(sessionId, new Set());
    }

    const session = await acpClient.loadSession(sessionId, cwd || process.cwd());

    return Response.json({
      sessionId: session.sessionId,
      configOptions: session.configOptions,
    });
  } catch (error) {
    console.error("Failed to load session:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

// POST /api/prompt
async function handlePrompt(req: Request): Promise<Response> {
  try {
    const { sessionId, text } = await req.json<{
      sessionId: string;
      text: string;
    }>();

    const result = await acpClient.prompt(sessionId, text);
    return Response.json({ stopReason: result.stopReason });
  } catch (error) {
    console.error("Prompt error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

// POST /api/config
async function handleConfig(req: Request): Promise<Response> {
  try {
    const { sessionId, configId, value } = await req.json<{
      sessionId: string;
      configId: string;
      value: string;
    }>();

    const result = await acpClient.setConfig(sessionId, configId, value);
    return Response.json({ configOptions: result.configOptions });
  } catch (error) {
    console.error("Config error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

// GET /api/updates/:sessionId — SSE stream
function handleUpdates(sessionId: string): Response {
  const controllers = sseControllers.get(sessionId);
  if (!controllers) {
    // Create controllers set on-demand for loaded sessions
    sseControllers.set(sessionId, new Set());
  }
  const set = sseControllers.get(sessionId)!;

  let myController: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      myController = controller;
      set.add(controller);
      controller.enqueue(new TextEncoder().encode(": connected\n\n"));
    },
    cancel() {
      set.delete(myController);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// Connect to ACP agent on server start
ensureConnected().then(() => {
  console.log("ACP agent connected");
}).catch((err) => {
  console.error("Failed to connect ACP agent:", err);
});

Bun.serve({
  port: PORT,
  idleTimeout: 120,
  fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === "POST" && path === "/api/session") return handleNewSession(req);
    if (req.method === "GET" && path === "/api/sessions") return handleListSessions(req);
    if (req.method === "POST" && path === "/api/session/load") return handleLoadSession(req);
    if (req.method === "POST" && path === "/api/prompt") return handlePrompt(req);
    if (req.method === "POST" && path === "/api/config") return handleConfig(req);

    if (req.method === "GET" && path.startsWith("/api/updates/")) {
      return handleUpdates(path.replace("/api/updates/", ""));
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`Codia server running on http://localhost:${PORT}`);
