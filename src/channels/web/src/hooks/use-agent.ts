import { useState, useEffect, useRef, useCallback } from "react";

// ── Types ───────────────────────────────────────────────────────────

export type ToolKind =
  | "read"
  | "edit"
  | "delete"
  | "move"
  | "search"
  | "execute"
  | "think"
  | "fetch"
  | "other";

export type ToolCallStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed";

export type ToolCallLocation = {
  path: string;
  line?: number;
};

export type ToolContentBlock =
  | { type: "content"; content: { type: "text"; text: string } }
  | { type: "diff"; path: string; oldText?: string; newText: string }
  | { type: "terminal"; terminalId: string };

export type Part =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | {
      type: "dynamic-tool";
      toolCallId: string;
      toolName: string;
      title: string;
      kind: ToolKind;
      state: ToolCallStatus;
      input: Record<string, unknown>;
      content: ToolContentBlock[];
      locations: ToolCallLocation[];
    };

export type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  parts: Part[];
};

export type ModelInfo = {
  modelId: string;
  name: string;
  description?: string;
};

type Status = "connecting" | "loading" | "ready" | "streaming" | "error";

type ServerMessage =
  | {
      type: "session/ready";
      sessionId: string;
      models: ModelInfo[];
      currentModelId: string | null;
    }
  | { type: "update"; update: SessionUpdate }
  | {
      type: "prompt/done";
      stopReason: string;
      usage?: { inputTokens: number; outputTokens: number };
    }
  | { type: "model/set"; modelId: string }
  | { type: "error"; message: string };

type SessionUpdate = {
  sessionUpdate: string;
  [key: string]: unknown;
};

// ── Hook ────────────────────────────────────────────────────────────

export function useAgent(sessionId: string | null) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  // Separate state for the in-progress streaming message to avoid
  // re-creating the full messages array on every chunk
  const [streamingMessage, setStreamingMessage] = useState<AgentMessage | null>(
    null,
  );
  const [status, setStatus] = useState<Status>("connecting");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [resolvedSessionId, setResolvedSessionId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const currentAssistantRef = useRef<AgentMessage | null>(null);
  const flushRafRef = useRef<number | null>(null);
  const statusRef = useRef<Status>("connecting");

  // Keep statusRef in sync
  statusRef.current = status;

  // Throttled flush: at most once per animation frame
  const scheduleFlush = useCallback(() => {
    if (flushRafRef.current !== null) return;
    flushRafRef.current = requestAnimationFrame(() => {
      flushRafRef.current = null;
      const assistant = currentAssistantRef.current;
      if (!assistant) return;
      // Deep-copy parts to preserve React immutability
      const snapshot: AgentMessage = {
        ...assistant,
        parts: assistant.parts.map((p) => ({ ...p })),
      };
      setStreamingMessage(snapshot);
    });
  }, []);

  // Finalize: move streaming message into the stable messages array
  const finalizeAssistant = useCallback(() => {
    // Cancel any pending RAF
    if (flushRafRef.current !== null) {
      cancelAnimationFrame(flushRafRef.current);
      flushRafRef.current = null;
    }
    const assistant = currentAssistantRef.current;
    if (!assistant) return;
    const snapshot: AgentMessage = {
      ...assistant,
      parts: assistant.parts.map((p) => ({ ...p })),
    };
    setMessages((prev) => {
      const existing = prev.findIndex((m) => m.id === assistant.id);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = snapshot;
        return next;
      }
      return [...prev, snapshot];
    });
    setStreamingMessage(null);
    currentAssistantRef.current = null;
  }, []);

  // Process a session update notification
  const handleUpdate = useCallback(
    (update: SessionUpdate) => {
      const type = update.sessionUpdate;

      if (type === "user_message_chunk") {
        // Finalize any in-progress assistant
        if (currentAssistantRef.current) {
          finalizeAssistant();
        }

        const text = (update as any).content?.text;
        if (!text) return;

        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "user") {
            const lastPart = last.parts[last.parts.length - 1];
            if (lastPart?.type === "text") {
              const updated = { ...last, parts: [...last.parts] };
              updated.parts[updated.parts.length - 1] = {
                type: "text",
                text: lastPart.text + text,
              };
              return [...prev.slice(0, -1), updated];
            }
          }
          return [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "user" as const,
              parts: [{ type: "text" as const, text }],
            },
          ];
        });
        return;
      }

      if (type === "agent_message_chunk") {
        if (!currentAssistantRef.current) {
          currentAssistantRef.current = {
            id: crypto.randomUUID(),
            role: "assistant",
            parts: [],
          };
        }
        const text = (update as any).content?.text;
        if (text) {
          const parts = currentAssistantRef.current.parts;
          const lastPart = parts[parts.length - 1];
          if (lastPart?.type === "text") {
            lastPart.text += text;
          } else {
            parts.push({ type: "text", text });
          }
          scheduleFlush();
        }
        return;
      }

      if (type === "agent_thought_chunk") {
        if (!currentAssistantRef.current) {
          currentAssistantRef.current = {
            id: crypto.randomUUID(),
            role: "assistant",
            parts: [],
          };
        }
        const text = (update as any).content?.text;
        if (text) {
          const parts = currentAssistantRef.current.parts;
          const lastPart = parts[parts.length - 1];
          if (lastPart?.type === "reasoning") {
            lastPart.text += text;
          } else {
            parts.push({ type: "reasoning", text });
          }
          scheduleFlush();
        }
        return;
      }

      if (type === "tool_call") {
        if (!currentAssistantRef.current) {
          currentAssistantRef.current = {
            id: crypto.randomUUID(),
            role: "assistant",
            parts: [],
          };
        }
        const meta = (update as any)._meta?.claudeCode;
        currentAssistantRef.current.parts.push({
          type: "dynamic-tool",
          toolCallId: (update as any).toolCallId,
          toolName: meta?.toolName ?? "unknown",
          title: (update as any).title ?? "",
          kind: (update as any).kind ?? "other",
          state: (update as any).status ?? "pending",
          input: (update as any).rawInput ?? {},
          content: (update as any).content ?? [],
          locations: (update as any).locations ?? [],
        });
        scheduleFlush();
        return;
      }

      if (type === "tool_call_update") {
        if (!currentAssistantRef.current) return;
        const toolPart = currentAssistantRef.current.parts.find(
          (p) =>
            p.type === "dynamic-tool" &&
            p.toolCallId === (update as any).toolCallId,
        ) as Extract<Part, { type: "dynamic-tool" }> | undefined;
        if (toolPart) {
          const content = (update as any).content as
            | ToolContentBlock[]
            | undefined;
          if (content) {
            toolPart.content = content;
          }
          const locations = (update as any).locations as
            | ToolCallLocation[]
            | undefined;
          if (locations) {
            toolPart.locations = locations;
          }
          if ((update as any).status) {
            toolPart.state = (update as any).status;
          }
          if ((update as any).title) {
            toolPart.title = (update as any).title;
          }
          scheduleFlush();
        }
        return;
      }
    },
    [scheduleFlush, finalizeAssistant],
  );

  // Connect WebSocket and init session
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (sessionId) {
        setStatus("loading");
        ws.send(JSON.stringify({ type: "session/load", sessionId }));
      } else {
        ws.send(JSON.stringify({ type: "session/new" }));
      }
    };

    ws.onmessage = (event) => {
      const msg: ServerMessage = JSON.parse(event.data);

      if (msg.type === "session/ready") {
        setResolvedSessionId(msg.sessionId);
        setModels(msg.models);
        setSelectedModel(msg.currentModelId ?? msg.models[0]?.modelId ?? "");
        setStatus("ready");
        // Finalize any replayed assistant message from session/load
        if (currentAssistantRef.current) {
          finalizeAssistant();
        }
      }

      if (msg.type === "update") {
        handleUpdate(msg.update);
      }

      if (msg.type === "prompt/done") {
        finalizeAssistant();
        setStatus("ready");
      }

      if (msg.type === "error") {
        console.error("[agent] Error:", msg.message);
        setError(msg.message);
        // Use ref to avoid stale closure over status
        if ((statusRef.current === "connecting" || statusRef.current === "loading") && sessionId) {
          ws.send(JSON.stringify({ type: "session/new" }));
          return;
        }
        setStatus("ready");
      }

      if (msg.type === "model/set") {
        setSelectedModel(msg.modelId);
      }
    };

    ws.onclose = () => {
      console.log("[agent] WebSocket closed");
    };

    ws.onerror = (err) => {
      console.error("[agent] WebSocket error:", err);
      setError("Connection lost");
      setStatus("error");
    };

    return () => {
      ws.close();
      wsRef.current = null;
      if (flushRafRef.current !== null) {
        cancelAnimationFrame(flushRafRef.current);
        flushRafRef.current = null;
      }
    };
  }, [sessionId]);

  // Merge stable messages with the in-progress streaming message for consumers
  const allMessages =
    streamingMessage !== null
      ? (() => {
          const idx = messages.findIndex((m) => m.id === streamingMessage.id);
          if (idx >= 0) {
            const next = [...messages];
            next[idx] = streamingMessage;
            return next;
          }
          return [...messages, streamingMessage];
        })()
      : messages;

  const sendMessage = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    // Add user message to state immediately
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user" as const,
        parts: [{ type: "text" as const, text }],
      },
    ]);

    setStatus("streaming");
    wsRef.current.send(JSON.stringify({ type: "prompt", text }));
  }, []);

  const cancel = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "cancel" }));
  }, []);

  const changeModel = useCallback((modelId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setSelectedModel(modelId);
    wsRef.current.send(JSON.stringify({ type: "set_model", modelId }));
  }, []);

  return {
    messages: allMessages,
    status,
    models,
    selectedModel,
    sessionId: resolvedSessionId,
    error,
    sendMessage,
    cancel,
    changeModel,
  };
}
