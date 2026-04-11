import { useState, useRef, useEffect, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import Markdown from "react-markdown";

type ModelInfo = {
  modelId: string;
  name: string;
  description?: string;
};

type SessionListItem = {
  sessionId: string;
  cwd?: string;
  title?: string;
  lastUpdated?: string;
};

function useRoute() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = (to: string) => {
    window.history.pushState(null, "", to);
    setPath(to);
  };

  return { path, navigate };
}

function SessionPicker({ navigate }: { navigate: (to: string) => void }) {
  const [pastSessions, setPastSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data) => setPastSessions(data.sessions || []))
      .catch((err) => console.error("Failed to fetch sessions:", err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col h-screen max-w-[860px] mx-auto">
      <header className="flex items-center gap-2.5 px-6 py-3.5 border-b border-border bg-bg-secondary">
        <h1 className="font-mono text-base font-semibold text-accent tracking-tight">
          <span className="text-text-muted">&gt; </span>Codia
        </h1>
      </header>
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
        <button
          className="px-5 py-3.5 bg-accent-dark text-white border-none rounded-lg font-mono text-[13px] font-semibold cursor-pointer transition-[background,transform] duration-150 hover:bg-accent hover:scale-[1.01] active:scale-[0.98]"
          onClick={() => navigate("/session/new")}
        >
          + New Session
        </button>

        {loading && (
          <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-text-muted px-0.5 py-1">
            Loading sessions...
          </div>
        )}
        {!loading && pastSessions.length === 0 && (
          <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-text-muted px-0.5 py-1">
            No previous sessions found
          </div>
        )}
        {pastSessions.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-text-muted px-0.5 py-1">
              Recent sessions
            </div>
            {pastSessions.map((s) => (
              <button
                key={s.sessionId}
                className="flex items-center justify-between px-4 py-3 bg-bg-secondary border border-border rounded-lg text-text-primary font-mono text-[13px] cursor-pointer text-left transition-[border-color,background] duration-150 hover:border-accent hover:bg-bg-tertiary"
                onClick={() => navigate(`/session/${s.sessionId}`)}
              >
                <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                  {s.title || s.sessionId.slice(0, 8)}
                </span>
                <span className="flex gap-3 text-[11px] text-text-muted shrink-0 ml-3">
                  {s.cwd && <span className="text-accent-light">{s.cwd.split("/").pop()}</span>}
                  {s.lastUpdated && (
                    <span>{new Date(s.lastUpdated).toLocaleDateString()}</span>
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

/**
 * Inner chat component — only mounted once session is initialized
 * and initial messages are available.
 */
function ChatInner({
  initialMessages,
  models,
  navigate,
}: {
  initialMessages: any[];
  models: ModelInfo[];
  navigate: (to: string) => void;
}) {
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState(models[0]?.modelId ?? "");
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/chat",
    // ACP session holds full history — only send the latest user message
    prepareSendMessagesRequest: ({ messages: msgs, ...rest }) => ({
      body: {
        messages: msgs.length > 0 ? [msgs[msgs.length - 1]] : msgs,
      },
    }),
  }), []);

  const { messages, status, sendMessage } = useChat({
    transport,
    messages: initialMessages.length > 0 ? initialMessages : undefined,
  });

  const isReady = status === "ready";
  const isStreaming = status === "streaming";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleModelChange = async (modelId: string) => {
    setSelectedModel(modelId);
    try {
      await fetch("/api/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId }),
      });
    } catch (err) {
      console.error("Failed to set model:", err);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !isReady) return;
    sendMessage({ text: input });
    setInput("");
  };

  const toggleTool = (id: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-screen max-w-[860px] mx-auto">
      <header className="flex items-center gap-2.5 px-6 py-3.5 border-b border-border bg-bg-secondary">
        <button
          className="bg-transparent border border-border text-text-secondary w-[30px] h-[30px] rounded-md cursor-pointer flex items-center justify-center text-base shrink-0 transition-[border-color,color] duration-150 hover:border-accent hover:text-text-primary"
          onClick={() => navigate("/")}
          title="Back to sessions"
        >
          &larr;
        </button>
        <h1 className="font-mono text-base font-semibold text-accent tracking-tight">
          <span className="text-text-muted">&gt; </span>Codia
        </h1>

        {models.length > 0 && (
          <select
            className="ml-auto px-2.5 py-1 bg-bg-primary border border-border rounded-md text-text-secondary font-mono text-[11px] outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:border-accent"
            value={selectedModel}
            onChange={(e) => handleModelChange(e.target.value)}
            disabled={isStreaming}
          >
            {models.map((m) => (
              <option key={m.modelId} value={m.modelId} className="bg-bg-secondary text-text-primary">
                {m.name}
              </option>
            ))}
          </select>
        )}

        <span
          className={`w-2 h-2 rounded-full shrink-0 ${
            isStreaming
              ? "bg-accent animate-[pulse-dot_1s_infinite]"
              : isReady
                ? "bg-green-400"
                : "bg-text-muted"
          }`}
        />
      </header>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
        {messages.length === 0 && isReady && (
          <div className="flex flex-col items-center justify-center mt-[28vh] animate-[fadeIn_0.5s_ease]">
            <p className="font-mono text-text-muted text-sm">// Ask me anything about your codebase.</p>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className="flex flex-col gap-1.5 animate-[slideUp_0.25s_ease]">
            <div
              className={`font-mono text-[11px] font-semibold uppercase tracking-wider pl-0.5 ${
                message.role === "user" ? "text-cyan-400" : "text-green-400"
              }`}
            >
              {message.role === "user" ? "You" : "Claude Code"}
            </div>
            <div
              className={`px-4 py-3 rounded-lg text-sm leading-relaxed whitespace-pre-wrap break-words border ${
                message.role === "user"
                  ? "bg-bg-tertiary border-border border-l-[3px] border-l-cyan-400"
                  : "bg-bg-secondary border-border border-l-[3px] border-l-green-400"
              }`}
            >
              {message.parts.map((part, i) => {
                if (part.type === "reasoning") {
                  const key = `${message.id}-reasoning-${i}`;
                  const isExpanded = expandedTools.has(key);
                  return (
                    <div key={i} className="my-1.5 p-2 px-3 bg-bg-primary border border-border border-l-[3px] border-l-accent rounded-md text-[13px]">
                      <div
                        className="flex items-center gap-1.5 cursor-pointer select-none"
                        onClick={() => toggleTool(key)}
                      >
                        <span className={`text-[10px] text-text-muted transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}>
                          &#9654;
                        </span>
                        <span className="font-mono text-xs italic text-accent-light">thinking</span>
                      </div>
                      {isExpanded && (
                        <div className="mt-2 pt-2 border-t border-border text-[13px] text-text-secondary leading-relaxed whitespace-pre-wrap break-words">
                          {part.text}
                        </div>
                      )}
                    </div>
                  );
                }

                if (part.type === "text") {
                  if (message.role === "user") {
                    return <span key={i}>{part.text}</span>;
                  }
                  return (
                    <div key={i} className="leading-[1.7] [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_strong]:text-text-primary [&_strong]:font-semibold [&_code]:bg-bg-primary [&_code]:border [&_code]:border-border [&_code]:rounded [&_code]:px-1.5 [&_code]:py-px [&_code]:font-mono [&_code]:text-xs [&_code]:text-accent-light [&_pre]:bg-bg-primary [&_pre]:border [&_pre]:border-border [&_pre]:rounded-md [&_pre]:p-3 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:border-0 [&_pre_code]:p-0 [&_pre_code]:text-text-primary [&_ul]:pl-6 [&_ul]:my-2 [&_ol]:pl-6 [&_ol]:my-2 [&_li]:my-1 [&_h1]:text-text-primary [&_h1]:my-3 [&_h1]:text-xl [&_h2]:text-text-primary [&_h2]:my-3 [&_h2]:text-lg [&_h3]:text-text-primary [&_h3]:my-2 [&_h3]:text-base [&_a]:text-accent-light [&_a]:no-underline hover:[&_a]:underline [&_blockquote]:border-l-[3px] [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-text-secondary [&_blockquote]:my-2">
                      <Markdown>{part.text}</Markdown>
                    </div>
                  );
                }

                if (part.type === "dynamic-tool") {
                  const isExpanded = expandedTools.has(part.toolCallId);
                  const isDone = part.state === "output-available";
                  return (
                    <div key={i} className="my-2 p-2.5 px-3.5 bg-bg-primary border border-border rounded-md text-[13px]">
                      <div
                        className="flex items-center gap-1.5 cursor-pointer select-none"
                        onClick={() => toggleTool(part.toolCallId)}
                      >
                        <span className={`text-[10px] text-text-muted transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}>
                          &#9654;
                        </span>
                        <span className="text-yellow-400 font-mono font-semibold text-xs">
                          <span className="text-accent font-normal">fn </span>
                          {part.toolName}
                        </span>
                        <span className={`ml-auto font-mono text-[11px] ${isDone ? "text-green-400" : "text-text-muted"}`}>
                          {isDone ? "done" : "running"}
                        </span>
                      </div>
                      {isExpanded && isDone && part.output && (
                        <pre className="mt-2 pt-2 border-t border-border font-mono text-xs text-text-secondary max-h-[200px] overflow-y-auto whitespace-pre-wrap leading-relaxed">
                          {typeof part.output === "string" ? part.output : JSON.stringify(part.output, null, 2)}
                        </pre>
                      )}
                    </div>
                  );
                }

                return null;
              })}
            </div>
          </div>
        ))}

        {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex items-center gap-2 font-mono text-text-muted text-[13px] pl-0.5 animate-[fadeIn_0.3s_ease]">
            <div className="flex gap-[3px]">
              <span className="w-[5px] h-[5px] rounded-full bg-accent opacity-40 animate-[bounce-dot_1.2s_infinite]" />
              <span className="w-[5px] h-[5px] rounded-full bg-accent opacity-40 animate-[bounce-dot_1.2s_infinite_0.15s]" />
              <span className="w-[5px] h-[5px] rounded-full bg-accent opacity-40 animate-[bounce-dot_1.2s_infinite_0.3s]" />
            </div>
            Thinking...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form className="flex items-center gap-2.5 px-6 py-4 border-t border-border bg-bg-secondary" onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isReady ? "Ask something..." : "Thinking..."}
          disabled={!isReady}
          autoFocus
          className="flex-1 px-4 py-2.5 bg-bg-primary border-[1.5px] border-border rounded-lg text-text-primary font-mono text-[13px] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-text-muted focus:border-accent focus:shadow-[0_0_0_3px_rgba(45,212,191,0.1)] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!isReady || !input.trim()}
          className="flex items-center justify-center w-10 h-10 bg-accent-dark text-white border-none rounded-lg cursor-pointer transition-[background,transform] duration-150 shrink-0 hover:not-disabled:bg-accent hover:not-disabled:scale-[1.04] active:not-disabled:scale-[0.96] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </form>
    </div>
  );
}

/**
 * Wrapper that handles session initialization before mounting ChatInner.
 */
function ChatView({ sessionId, navigate }: { sessionId: string | null; navigate: (to: string) => void }) {
  const [sessionData, setSessionData] = useState<{
    models: ModelInfo[];
    history: any[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        let data;
        if (sessionId) {
          const res = await fetch("/api/session/load", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
          });
          data = await res.json();
        } else {
          const res = await fetch("/api/session/new", { method: "POST" });
          data = await res.json();
          if (data.sessionId) {
            window.history.replaceState(null, "", `/session/${data.sessionId}`);
          }
        }
        setSessionData({
          models: data.models || [],
          history: data.history || [],
        });
      } catch (err) {
        console.error("Failed to initialize session:", err);
        setError(String(err));
      }
    };
    init();
  }, [sessionId]);

  if (error) {
    return (
      <div className="flex flex-col h-screen max-w-[860px] mx-auto">
        <header className="flex items-center gap-2.5 px-6 py-3.5 border-b border-border bg-bg-secondary">
          <button
            className="bg-transparent border border-border text-text-secondary w-[30px] h-[30px] rounded-md cursor-pointer flex items-center justify-center text-base shrink-0"
            onClick={() => navigate("/")}
          >
            &larr;
          </button>
          <h1 className="font-mono text-base font-semibold text-accent tracking-tight">
            <span className="text-text-muted">&gt; </span>Codia
          </h1>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <p className="font-mono text-red-400 text-sm">// Failed to connect</p>
        </div>
      </div>
    );
  }

  if (!sessionData) {
    return (
      <div className="flex flex-col h-screen max-w-[860px] mx-auto">
        <header className="flex items-center gap-2.5 px-6 py-3.5 border-b border-border bg-bg-secondary">
          <button
            className="bg-transparent border border-border text-text-secondary w-[30px] h-[30px] rounded-md cursor-pointer flex items-center justify-center text-base shrink-0"
            onClick={() => navigate("/")}
          >
            &larr;
          </button>
          <h1 className="font-mono text-base font-semibold text-accent tracking-tight">
            <span className="text-text-muted">&gt; </span>Codia
          </h1>
          <span className="w-2 h-2 rounded-full shrink-0 bg-accent animate-[pulse-dot_1s_infinite]" />
        </header>
        <div className="flex-1 flex items-center justify-center">
          <p className="font-mono text-text-muted text-sm">// Connecting to Claude Code...</p>
        </div>
      </div>
    );
  }

  return (
    <ChatInner
      initialMessages={sessionData.history}
      models={sessionData.models}
      navigate={navigate}
    />
  );
}

export default function App() {
  const { path, navigate } = useRoute();

  const sessionMatch = path.match(/^\/session\/(.+)$/);

  if (sessionMatch) {
    const id = sessionMatch[1];
    return <ChatView key={id === "new" ? `new-${Date.now()}` : id} sessionId={id === "new" ? null : id} navigate={navigate} />;
  }

  return <SessionPicker navigate={navigate} />;
}
