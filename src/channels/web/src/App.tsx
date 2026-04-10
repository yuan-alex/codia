import { useState, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import "./App.css";

export default function App() {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && status === "ready") {
      sendMessage({ text: input });
      setInput("");
      inputRef.current?.focus();
    }
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
    <div className="container">
      <header>
        <h1>Codia</h1>
      </header>

      <div className="messages">
        {messages.length === 0 && (
          <div className="empty">
            <p>Ask me anything about your codebase.</p>
          </div>
        )}
        {messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            <div className="role">
              {message.role === "user" ? "You" : "Codia"}
            </div>
            <div className="bubble">
              {message.parts.map((part, i) => {
                if (part.type === "reasoning") {
                  return (
                    <div key={i} className="reasoning">
                      <div
                        className="reasoning-header"
                        onClick={() => toggleTool(`${message.id}-reasoning-${i}`)}
                      >
                        <span
                          className={`tool-icon ${expandedTools.has(`${message.id}-reasoning-${i}`) ? "open" : ""}`}
                        >
                          &#9654;
                        </span>
                        <span className="reasoning-label">thinking</span>
                      </div>
                      {expandedTools.has(`${message.id}-reasoning-${i}`) && (
                        <div className="reasoning-text">{part.text}</div>
                      )}
                    </div>
                  );
                }
                if (part.type === "text") {
                  return <span key={i}>{part.text}</span>;
                }
                if (part.type === "tool-invocation") {
                  const toolId = `${message.id}-${i}`;
                  const isExpanded = expandedTools.has(toolId);
                  const isDone = part.toolInvocation.state === "result";
                  return (
                    <div key={i} className="tool-call">
                      <div
                        className="tool-header"
                        onClick={() => toggleTool(toolId)}
                      >
                        <span
                          className={`tool-icon ${isExpanded ? "open" : ""}`}
                        >
                          &#9654;
                        </span>
                        <span className="tool-name">
                          {part.toolInvocation.toolName}
                        </span>
                        <span
                          className={`tool-status ${isDone ? "done" : ""}`}
                        >
                          {isDone ? "done" : "running..."}
                        </span>
                      </div>
                      {isExpanded && isDone && (
                        <pre className="tool-result">
                          {typeof part.toolInvocation.result === "string"
                            ? part.toolInvocation.result
                            : JSON.stringify(
                                part.toolInvocation.result,
                                null,
                                2
                              )}
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
        {status === "in-progress" &&
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
          placeholder="Ask something..."
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
