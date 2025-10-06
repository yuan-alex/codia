import { Hono } from "hono";
import { convertToModelMessages, type UIMessage } from "ai";
import { agent } from "../lib/agent";
import { config } from "../lib/config";

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

export default {
  port: config.port,
  fetch: app.fetch,
};
