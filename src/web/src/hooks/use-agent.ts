import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ── ANSI stripping ───────────────────────────────────────────────────

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1B(?:\[[0-9;]*[mGKHFJA-Za-z]|[()][012AB])/g;

function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, "");
}

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
  | "agent"
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

export type PermissionMode = "plan" | "default" | "acceptEdits" | "auto" | "dontAsk" | "bypassPermissions";

export type PermissionDenial = {
  toolName: string;
  toolUseId: string;
};

type Status = "connecting" | "loading" | "ready" | "streaming" | "error";

type ServerMessage =
  | {
      type: "session/ready";
      sessionId: string;
      models: ModelInfo[];
      currentModelId: string | null;
      currentPermissionMode?: PermissionMode;
    }
  | { type: "update"; update: SessionUpdate }
  | { type: "debug"; event: unknown }
  | {
      type: "prompt/done";
      stopReason: string;
      usage?: { inputTokens: number; outputTokens: number };
      permissionDenials?: PermissionDenial[];
    }
  | { type: "model/set"; modelId: string }
  | { type: "permission_mode/set"; permissionMode: PermissionMode }
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
  const [permissionMode, setPermissionMode] = useState<PermissionMode>("acceptEdits");
  const [permissionDenials, setPermissionDenials] = useState<PermissionDenial[]>([]);
  const [resolvedSessionId, setResolvedSessionId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [rawMessages, setRawMessages] = useState<unknown[]>([]);
  const [debugEvents, setDebugEvents] = useState<unknown[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const currentAssistantRef = useRef<AgentMessage | null>(null);
  const flushRafRef = useRef<number | null>(null);
  const statusRef = useRef<Status>("connecting");
  // Track the last seen messageId for user chunks so we can split them
  // correctly when ACP sends the experimental messageId field.
  const lastUserMessageIdRef = useRef<string | null>(null);

  // Keep statusRef in sync
  statusRef.current = status;

  // Throttled flush: at most once per animation frame.
  //
  // IMPORTANT: we only shallow-copy the parts *array*, not each part. Handlers
  // below replace the identity of any part they mutate (by assigning a fresh
  // object at that index), so unchanged parts keep their reference across
  // flushes. That lets React.memo'd children (tool renderers, message parts)
  // bail out of re-render while streaming.
  const scheduleFlush = useCallback(() => {
    if (flushRafRef.current !== null) return;
    flushRafRef.current = requestAnimationFrame(() => {
      flushRafRef.current = null;
      const assistant = currentAssistantRef.current;
      if (!assistant) return;
      const snapshot: AgentMessage = {
        ...assistant,
        parts: assistant.parts.slice(),
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
      parts: assistant.parts.slice(),
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

        const text = stripAnsi((update as any).content?.text ?? "");
        if (!text) return;

        // ACP ContentChunk carries an experimental messageId that groups
        // chunks belonging to the same logical message.  Use it to detect
        // message boundaries so that separate user turns (e.g. slash commands
        // like /effort followed by the real prompt) don't get smashed together.
        const messageId = (update as any).messageId as string | null | undefined;

        setMessages((prev) => {
          const last = prev[prev.length - 1];
          const sameMessage =
            last?.role === "user" &&
            // If we have messageId info, a change means a new message.
            // If messageId is absent we fall back to the old behaviour.
            (!messageId || messageId === lastUserMessageIdRef.current);

          if (sameMessage) {
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
          lastUserMessageIdRef.current = messageId ?? null;
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
        const text = stripAnsi((update as any).content?.text ?? "");
        if (text) {
          const parts = currentAssistantRef.current.parts;
          const lastIdx = parts.length - 1;
          const lastPart = parts[lastIdx];
          if (lastPart?.type === "text") {
            // Replace (new identity) so memoized children see a change —
            // but leave every other part's reference untouched.
            parts[lastIdx] = { type: "text", text: lastPart.text + text };
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
        const text = stripAnsi((update as any).content?.text ?? "");
        if (text) {
          const parts = currentAssistantRef.current.parts;
          const lastIdx = parts.length - 1;
          const lastPart = parts[lastIdx];
          if (lastPart?.type === "reasoning") {
            parts[lastIdx] = {
              type: "reasoning",
              text: lastPart.text + text,
            };
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
        const parts = currentAssistantRef.current.parts;
        const idx = parts.findIndex(
          (p) =>
            p.type === "dynamic-tool" &&
            p.toolCallId === (update as any).toolCallId,
        );
        if (idx < 0) return;
        const toolPart = parts[idx] as Extract<Part, { type: "dynamic-tool" }>;
        // Build a replacement object so only this tool gets a new identity.
        const next: Extract<Part, { type: "dynamic-tool" }> = { ...toolPart };
        const content = (update as any).content as
          | ToolContentBlock[]
          | undefined;
        if (content) next.content = content;
        const locations = (update as any).locations as
          | ToolCallLocation[]
          | undefined;
        if (locations) next.locations = locations;
        if ((update as any).status) next.state = (update as any).status;
        if ((update as any).title) next.title = (update as any).title;
        parts[idx] = next;
        scheduleFlush();
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
      setRawMessages((prev) => [...prev, msg]);

      if (msg.type === "session/ready") {
        setResolvedSessionId(msg.sessionId);
        setModels(msg.models);
        setSelectedModel(msg.currentModelId ?? msg.models[0]?.modelId ?? "");
        if (msg.currentPermissionMode) setPermissionMode(msg.currentPermissionMode);
        setStatus("ready");
        // Finalize any replayed assistant message from session/load
        if (currentAssistantRef.current) {
          finalizeAssistant();
        }
      }

      if (msg.type === "debug") {
        setDebugEvents((prev) => [...prev, msg.event]);
      }

      if (msg.type === "update") {
        handleUpdate(msg.update);
      }

      if (msg.type === "prompt/done") {
        finalizeAssistant();
        setStatus("ready");
        if (msg.permissionDenials?.length) {
          setPermissionDenials(msg.permissionDenials);
        }
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

      if (msg.type === "permission_mode/set") {
        setPermissionMode(msg.permissionMode);
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
  const allMessages = useMemo(
    () =>
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
        : messages,
    [messages, streamingMessage],
  );

  const sendMessage = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    // Clear any previous permission denials
    setPermissionDenials([]);

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

  const changeEffort = useCallback(
    (effort: "off" | "low" | "medium" | "high" | "max") => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      wsRef.current.send(JSON.stringify({ type: "set_effort", effort }));
    },
    [],
  );

  const changePermissionMode = useCallback((mode: PermissionMode) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setPermissionMode(mode);
    wsRef.current.send(JSON.stringify({ type: "set_permission_mode", permissionMode: mode }));
  }, []);

  const addInfoMessage = useCallback((text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "assistant" as const,
        parts: [{ type: "text" as const, text }],
      },
    ]);
  }, []);

  return {
    messages: allMessages,
    rawMessages,
    debugEvents,
    status,
    models,
    selectedModel,
    permissionMode,
    permissionDenials,
    sessionId: resolvedSessionId,
    error,
    sendMessage,
    cancel,
    changeModel,
    changeEffort,
    changePermissionMode,
    addInfoMessage,
  };
}
