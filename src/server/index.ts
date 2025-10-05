import { Hono } from "hono";
import { convertToModelMessages, type UIMessage } from "ai";
import { agent, runAgent } from "../lib/agent";

const app = new Hono();

app.post("/api/chat", async (c) => {
  try {
    const { messages } = await c.req.json<{ messages: UIMessage[] }>();
    const result = agent.stream({
      messages: convertToModelMessages(messages),
    });
    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("Error in /api/chat:", error);
    return c.json(
      { error: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
});

console.log("Server running on http://localhost:3000");

export default {
  port: 3000,
  fetch: app.fetch,
};
