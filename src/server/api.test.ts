import { test, expect, describe, beforeAll, afterAll } from "bun:test";

const BASE = "http://localhost:1337";

// Assumes the server is running on port 1337
// Start with: bun run ./src/server/index.ts

async function json(res: Response) {
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

describe("API", () => {
  test("GET /api/sessions — lists sessions", async () => {
    const res = await fetch(`${BASE}/api/sessions`);
    const data = await json(res);

    expect(data.sessions).toBeArray();
    if (data.sessions.length > 0) {
      const s = data.sessions[0];
      expect(s.sessionId).toBeString();
      expect(s.cwd).toBeString();
      console.log(`  Found ${data.sessions.length} sessions`);
      console.log(`  First: "${s.title}" (${s.sessionId.slice(0, 8)}...)`);
    }
  });

  let sessionId: string;

  test("POST /api/session/new — creates a session", async () => {
    const res = await fetch(`${BASE}/api/session/new`, { method: "POST" });
    const data = await json(res);

    expect(data.sessionId).toBeString();
    sessionId = data.sessionId;
    console.log(`  Session: ${sessionId.slice(0, 8)}...`);
    console.log(`  Models: ${(data.models ?? []).length}`);
    console.log(`  Modes: ${(data.modes ?? []).length}`);
    console.log(`  Current model: ${data.currentModelId ?? "none"}`);
    console.log(`  Current mode: ${data.currentModeId ?? "none"}`);

    if (data.models?.length) {
      for (const m of data.models) {
        console.log(`    - ${m.modelId ?? m.id}: ${m.name}`);
      }
    }
  }, 30_000);

  test("POST /api/chat — streams a response", async () => {
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            id: "test-1",
            role: "user",
            parts: [{ type: "text", text: "Say hello in exactly 3 words." }],
          },
        ],
      }),
    });

    expect(res.ok).toBe(true);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const text = await res.text();
    const lines = text.split("\n").filter((l) => l.trim());

    console.log(`  Received ${lines.length} stream lines`);
    // Dump first 20 lines for debugging
    for (const line of lines.slice(0, 20)) {
      console.log(`  > ${line.slice(0, 200)}`);
    }

    // Check we got some data
    expect(lines.length).toBeGreaterThan(0);

    // Parse SSE or JSON lines
    const partTypes = new Set<string>();
    for (const line of lines) {
      // SSE format: "data: {...}"
      const data = line.startsWith("data: ") ? line.slice(6) : line;
      try {
        const parsed = JSON.parse(data);
        if (parsed.type) partTypes.add(parsed.type);
      } catch {
        // not all lines are JSON — could be SSE event lines
        if (line.startsWith("event:"))
          partTypes.add(`sse:${line.slice(6).trim()}`);
      }
    }
    console.log(`  Part types: ${[...partTypes].join(", ")}`);
  }, 60_000);

  test("POST /api/session/load — loads session with history", async () => {
    // Get a session to load
    const listRes = await fetch(`${BASE}/api/sessions`);
    const listData = await json(listRes);

    if (listData.sessions.length === 0) {
      console.log("  Skipped: no sessions to load");
      return;
    }

    const targetId = listData.sessions[0].sessionId;
    console.log(`  Loading: ${targetId.slice(0, 8)}...`);

    const res = await fetch(`${BASE}/api/session/load`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: targetId }),
    });
    const data = await json(res);

    expect(data.sessionId).toBe(targetId);
    expect(data.history).toBeArray();

    console.log(`  History: ${data.history.length} messages`);

    // Validate message structure
    for (const msg of data.history) {
      expect(msg.id).toBeString();
      expect(["user", "assistant"]).toContain(msg.role);
      expect(msg.parts).toBeArray();

      for (const part of msg.parts) {
        expect(["text", "reasoning", "dynamic-tool"]).toContain(part.type);

        if (part.type === "text") {
          expect(part.text).toBeString();
        }
        if (part.type === "reasoning") {
          expect(part.text).toBeString();
        }
        if (part.type === "dynamic-tool") {
          expect(part.toolCallId).toBeString();
          expect(part.toolName).toBeString();
          expect(["input-available", "output-available"]).toContain(part.state);
        }
      }
    }

    // Log a summary
    const roles = data.history.map((m: any) => m.role);
    const partTypes = data.history.flatMap((m: any) =>
      m.parts.map((p: any) => p.type),
    );
    console.log(`  Roles: ${roles.join(", ")}`);
    console.log(`  Part types: ${[...new Set(partTypes)].join(", ")}`);
  }, 60_000);

  test("POST /api/chat — works after loading session with tool-call history", async () => {
    // This is the key regression test: loading a session with dynamic-tool
    // parts and then chatting used to fail with "Tool result is missing"
    const listRes = await fetch(`${BASE}/api/sessions`);
    const listData = await json(listRes);
    if (listData.sessions.length === 0) {
      console.log("  Skipped: no sessions");
      return;
    }

    // Load a session
    const targetId = listData.sessions[0].sessionId;
    const loadRes = await fetch(`${BASE}/api/session/load`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: targetId }),
    });
    const loadData = await json(loadRes);
    console.log(`  Loaded session with ${loadData.history.length} messages`);

    // Simulate useChat: send full history + new user message
    const messages = [
      ...loadData.history,
      {
        id: "regression-test-1",
        role: "user",
        parts: [{ type: "text", text: "Say exactly: test passed" }],
      },
    ];

    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });

    expect(res.ok).toBe(true);
    const text = await res.text();
    const lines = text.split("\n").filter((l) => l.trim());

    const hasError = lines.some((l) => l.includes('"type":"error"'));
    if (hasError) {
      for (const l of lines) {
        if (l.includes("error")) console.log(`  ERROR: ${l.slice(0, 200)}`);
      }
    }
    expect(hasError).toBe(false);

    const hasContent = lines.some((l) => l.includes("text-delta"));
    console.log(`  Stream lines: ${lines.length}, has content: ${hasContent}`);
    expect(hasContent).toBe(true);
  }, 120_000);
});
