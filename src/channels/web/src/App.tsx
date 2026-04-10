import { useState, useRef, useEffect, useCallback } from "react";
import Markdown from "react-markdown";
import "./App.css";

type ConfigOption = {
  id: string;
  name: string;
  type: string;
  currentValue: string;
  options?: Array<{ value: string; name: string; description?: string }>;
};

type SessionInfo = {
  sessionId: string;
  cwd?: string;
  title?: string;
  lastUpdated?: string;
};

type Update =
  | {
      sessionUpdate: "agent_message_chunk";
      content: { type: string; text?: string };
    }
  | {
      sessionUpdate: "tool_call";
      toolCallId: string;
      title: string;
      status: string;
      kind: string;
    }
  | {
      sessionUpdate: "tool_call_update";
      toolCallId: string;
      status: string;
      content?: Array<{ type: string; content?: { type: string; text?: string } }>;
    }
  | {
      sessionUpdate: "agent_thought_chunk";
      content: { type: string; text?: string };
    }
  | {
      sessionUpdate: "plan";
      entries: Array<{ content: string; status: string }>;
    }
  | { sessionUpdate: string };

type Part =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool"; id: string; title: string; status: string; result?: string };

type Message = {
  id: string;
  role: "user" | "assistant";
  parts: Part[];
};

type View = "picker" | "chat";

export default function App() {
  const [view, setView] = useState<View>("picker");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "loading" | "ready" | "thinking">("idle");
  const [configOptions, setConfigOptions] = useState<ConfigOption[]>([]);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [pastSessions, setPastSessions] = useState<SessionInfo[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const [loadingSessions, setLoadingSessions] = useState(true);

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchSessions = async () => {
    setLoadingSessions(true);
    try {
      const res = await fetch("/api/sessions");
      const data = await res.json();
      setPastSessions(data.sessions || []);
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    } finally {
      setLoadingSessions(false);
    }
  };

  const connectSSE = (id: string) => {
    eventSourceRef.current?.close();
    const es = new EventSource(`/api/updates/${id}`);
    eventSourceRef.current = es;
    es.onmessage = (event) => handleUpdate(JSON.parse(event.data));
    es.onerror = () => console.error("SSE connection error");
  };

  const startNewSession = async () => {
    setStatus("connecting");
    setView("chat");
    setMessages([]);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const { sessionId: id, configOptions: opts } = await res.json();
      setSessionId(id);
      if (opts) setConfigOptions(opts);
      connectSSE(id);
      setStatus("ready");
    } catch (err) {
      console.error("Failed to create session:", err);
      setStatus("idle");
      setView("picker");
    }
  };

  const loadSession = async (info: SessionInfo) => {
    setStatus("loading");
    setView("chat");
    setMessages([]);

    // Connect SSE *before* loading so we catch replayed history
    connectSSE(info.sessionId);

    try {
      const res = await fetch("/api/session/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: info.sessionId, cwd: info.cwd }),
      });
      const { sessionId: id, configOptions: opts } = await res.json();
      setSessionId(id);
      if (opts) setConfigOptions(opts);
      setStatus("ready");
    } catch (err) {
      console.error("Failed to load session:", err);
      eventSourceRef.current?.close();
      setStatus("idle");
      setView("picker");
    }
  };

  const goBack = () => {
    eventSourceRef.current?.close();
    setView("picker");
    setSessionId(null);
    setMessages([]);
    setConfigOptions([]);
    setStatus("idle");
    fetchSessions();
  };

  const handleUpdate = useCallback((update: Update) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      const isAssistant = last?.role === "assistant";
      const rest = isAssistant ? prev.slice(0, -1) : prev;
      const parts = isAssistant ? [...last.parts] : [];
      const msgId = isAssistant ? last.id : crypto.randomUUID();

      switch (update.sessionUpdate) {
        case "agent_message_chunk": {
          if (update.content.type === "text" && update.content.text) {
            const lastPart = parts[parts.length - 1];
            if (lastPart?.type === "text") {
              parts[parts.length - 1] = { ...lastPart, text: lastPart.text + update.content.text };
            } else {
              parts.push({ type: "text", text: update.content.text });
            }
          }
          break;
        }
        case "agent_thought_chunk": {
          if (update.content.text) {
            const lastPart = parts[parts.length - 1];
            if (lastPart?.type === "thinking") {
              parts[parts.length - 1] = { ...lastPart, text: lastPart.text + update.content.text };
            } else {
              parts.push({ type: "thinking", text: update.content.text });
            }
          }
          break;
        }
        case "tool_call": {
          parts.push({
            type: "tool",
            id: update.toolCallId,
            title: update.title,
            status: update.status,
          });
          break;
        }
        case "tool_call_update": {
          const idx = parts.findIndex(
            (p) => p.type === "tool" && p.id === update.toolCallId,
          );
          if (idx !== -1) {
            const toolPart = parts[idx] as Extract<Part, { type: "tool" }>;
            let result = toolPart.result;
            if (update.content) {
              result = update.content
                .map((c) =>
                  c.type === "content" && c.content?.type === "text"
                    ? c.content.text
                    : "",
                )
                .filter(Boolean)
                .join("\n");
            }
            parts[idx] = { ...toolPart, status: update.status, result };
          }
          break;
        }
        case "user_message_chunk": {
          const u = update as any;
          if (u.content?.type === "text" && u.content.text) {
            // If we were building an assistant message, finalize it first
            const base = isAssistant && parts.length > 0
              ? [...rest, { id: msgId, role: "assistant" as const, parts }]
              : prev;
            // Append to existing user message or create new one
            const lastBase = base[base.length - 1];
            if (lastBase?.role === "user") {
              const lastUserPart = lastBase.parts[lastBase.parts.length - 1];
              if (lastUserPart?.type === "text") {
                return [
                  ...base.slice(0, -1),
                  {
                    ...lastBase,
                    parts: [
                      ...lastBase.parts.slice(0, -1),
                      { ...lastUserPart, text: lastUserPart.text + u.content.text },
                    ],
                  },
                ];
              }
            }
            return [
              ...base,
              { id: crypto.randomUUID(), role: "user" as const, parts: [{ type: "text" as const, text: u.content.text }] },
            ];
          }
          return prev;
        }
        default:
          return prev;
      }

      return [...rest, { id: msgId, role: "assistant" as const, parts }];
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !sessionId || status !== "ready") return;

    const text = input.trim();
    setInput("");
    inputRef.current?.focus();

    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text }] },
    ]);

    setStatus("thinking");
    try {
      await fetch("/api/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, text }),
      });
    } catch (err) {
      console.error("Prompt failed:", err);
    }
    setStatus("ready");
  };

  const handleConfigChange = async (configId: string, value: string) => {
    if (!sessionId) return;
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, configId, value }),
      });
      const { configOptions: opts } = await res.json();
      if (opts) setConfigOptions(opts);
    } catch (err) {
      console.error("Failed to update config:", err);
    }
  };

  const modelOption = configOptions.find((o) => o.id === "model");

  const toggleTool = (id: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Session picker view
  if (view === "picker") {
    return (
      <div className="container">
        <header>
          <h1>Codia</h1>
        </header>
        <div className="picker">
          <button className="new-session-btn" onClick={startNewSession}>
            + New Session
          </button>
          {loadingSessions && (
            <div className="past-sessions-label">Loading sessions...</div>
          )}
          {!loadingSessions && pastSessions.length === 0 && (
            <div className="past-sessions-label">No previous sessions found</div>
          )}
          {pastSessions.length > 0 && (
            <div className="past-sessions">
              <div className="past-sessions-label">Recent sessions</div>
              {pastSessions.map((s) => (
                <button
                  key={s.sessionId}
                  className="session-item"
                  onClick={() => loadSession(s)}
                >
                  <span className="session-title">
                    {s.title || s.sessionId.slice(0, 8)}
                  </span>
                  <span className="session-meta">
                    {s.cwd && <span className="session-cwd">{s.cwd.split("/").pop()}</span>}
                    {s.lastUpdated && (
                      <span className="session-date">
                        {new Date(s.lastUpdated).toLocaleDateString()}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Chat view
  return (
    <div className="container">
      <header>
        <button className="back-btn" onClick={goBack} title="Back to sessions">
          &larr;
        </button>
        <h1>Codia</h1>
        {modelOption && modelOption.options && (
          <select
            className="model-select"
            value={modelOption.currentValue}
            onChange={(e) => handleConfigChange("model", e.target.value)}
            disabled={status === "thinking"}
          >
            {modelOption.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.name}
              </option>
            ))}
          </select>
        )}
        <span className={`status-dot ${status}`} />
      </header>

      <div className="messages">
        {messages.length === 0 && status === "ready" && (
          <div className="empty">
            <p>Ask me anything about your codebase.</p>
          </div>
        )}
        {(status === "connecting" || status === "loading") && (
          <div className="empty">
            <p>{status === "loading" ? "Loading session..." : "Connecting to Claude..."}</p>
          </div>
        )}
        {messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            <div className="role">
              {message.role === "user" ? "You" : "Claude Code"}
            </div>
            <div className="bubble">
              {message.parts.map((part, i) => {
                if (part.type === "thinking") {
                  return (
                    <div key={i} className="reasoning">
                      <div
                        className="reasoning-header"
                        onClick={() => toggleTool(`${message.id}-thinking-${i}`)}
                      >
                        <span
                          className={`tool-icon ${expandedTools.has(`${message.id}-thinking-${i}`) ? "open" : ""}`}
                        >
                          &#9654;
                        </span>
                        <span className="reasoning-label">thinking</span>
                      </div>
                      {expandedTools.has(`${message.id}-thinking-${i}`) && (
                        <div className="reasoning-text">{part.text}</div>
                      )}
                    </div>
                  );
                }
                if (part.type === "text") {
                  if (message.role === "user") {
                    return <span key={i}>{part.text}</span>;
                  }
                  return (
                    <div key={i} className="markdown-content">
                      <Markdown>{part.text}</Markdown>
                    </div>
                  );
                }
                if (part.type === "tool") {
                  const isExpanded = expandedTools.has(part.id);
                  const isDone = part.status === "completed";
                  const isFailed = part.status === "failed";
                  return (
                    <div key={i} className="tool-call">
                      <div
                        className="tool-header"
                        onClick={() => toggleTool(part.id)}
                      >
                        <span className={`tool-icon ${isExpanded ? "open" : ""}`}>
                          &#9654;
                        </span>
                        <span className="tool-name">{part.title}</span>
                        <span
                          className={`tool-status ${isDone ? "done" : ""} ${isFailed ? "failed" : ""}`}
                        >
                          {isDone ? "done" : part.status}
                        </span>
                      </div>
                      {isExpanded && part.result && (
                        <pre className="tool-result">{part.result}</pre>
                      )}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}
        {status === "thinking" &&
          messages[messages.length - 1]?.role !== "assistant" && (
            <div className="typing">
              <div className="typing-dots">
                <span />
                <span />
                <span />
              </div>
              Thinking...
            </div>
          )}
        <div ref={messagesEndRef} />
      </div>

      <form className="input-form" onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          ref={inputRef}
          placeholder={
            status === "connecting" || status === "loading"
              ? "Loading..."
              : status === "ready"
                ? "Ask something..."
                : "Thinking..."
          }
          disabled={status !== "ready"}
          autoFocus
        />
        <button type="submit" disabled={status !== "ready" || !input.trim()}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </form>
    </div>
  );
}
