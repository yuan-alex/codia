import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

import { ChatView, type ChatDebugInfo } from "./components/chat-view";
import { DebugPanel } from "./components/debug-panel";
import { Plus, MessageSquare } from "lucide-react";

type SessionListItem = {
  sessionId: string;
  cwd?: string;
  title?: string;
  lastUpdated?: string;
};

export default function App() {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [newSessionKey, setNewSessionKey] = useState(0);
  const [chatDebug, setChatDebug] = useState<ChatDebugInfo | null>(null);

  useEffect(() => {
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data) => setSessions(data.sessions || []))
      .catch((err) => console.error("Failed to fetch sessions:", err));
  }, []);

  const startNewSession = () => {
    setActiveSessionId(null);
    setNewSessionKey((k) => k + 1);
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-64 shrink-0 border-r border-border bg-card flex flex-col">
        <div className="px-4 py-4 border-b border-border">
          <h1 className="text-lg font-semibold text-primary">Codia</h1>
        </div>
        <div className="p-3">
          <Button onClick={startNewSession} className="w-full justify-start gap-2" variant="outline">
            <Plus className="size-4" />
            New Chat
          </Button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-3">
          <div className="flex flex-col gap-0.5 pb-3">
            {sessions.map((s) => (
              <button
                key={s.sessionId}
                onClick={() => setActiveSessionId(s.sessionId)}
                className={`flex items-center gap-2 w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
                  activeSessionId === s.sessionId ? "bg-muted font-medium" : "text-muted-foreground"
                }`}
              >
                <MessageSquare className="size-4 shrink-0" />
                <span className="truncate">{s.title || s.sessionId.slice(0, 8)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 min-w-0">
        <ChatView
          key={activeSessionId ?? `new-${newSessionKey}`}
          sessionId={activeSessionId}
          onDebugInfo={import.meta.env.DEV ? setChatDebug : undefined}
        />
      </div>

      {import.meta.env.DEV && (
        <DebugPanel
          data={{
            activeSessionId: activeSessionId ?? "(new session)",
            sessionCount: sessions.length,
            sessions: sessions.map((s) => ({
              id: s.sessionId.slice(0, 8),
              title: s.title ?? null,
            })),
            ...(chatDebug ? {
              "chat.status": chatDebug.status,
              "chat.messageCount": chatDebug.messageCount,
              "chat.selectedModel": chatDebug.selectedModel,
              "chat.lastMessageRole": chatDebug.lastMessageRole ?? "none",
              "chat.historyLength": chatDebug.historyLength,
              "chat.availableModels": chatDebug.models,
              "chat.messages": chatDebug.messages,
            } : {
              "chat": "loading...",
            }),
          }}
        />
      )}
    </div>
  );
}
