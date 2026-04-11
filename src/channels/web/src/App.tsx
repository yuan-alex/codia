import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";

import { ChatInner, type ChatDebugInfo } from "./components/chat-inner";
import { DebugPanel } from "./components/debug-panel";
import { AcpInspector } from "./components/acp-inspector";
import { Plus, MessageSquare } from "lucide-react";

type SessionListItem = {
  sessionId: string;
  cwd?: string;
  title?: string;
  lastUpdated?: string;
};

function getSessionIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("session");
}

function setSessionIdInUrl(sessionId: string | null) {
  const url = new URL(window.location.href);
  if (sessionId) {
    url.searchParams.set("session", sessionId);
  } else {
    url.searchParams.delete("session");
  }
  window.history.replaceState({}, "", url.toString());
}

export default function App() {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    getSessionIdFromUrl,
  );
  const [newSessionKey, setNewSessionKey] = useState(0);
  const [chatDebug, setChatDebug] = useState<ChatDebugInfo | null>(null);

  const fetchSessions = useCallback(() => {
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data) => setSessions(data.sessions || []))
      .catch((err) => console.error("Failed to fetch sessions:", err));
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const startNewSession = () => {
    setActiveSessionId(null);
    setSessionIdInUrl(null);
    setNewSessionKey((k) => k + 1);
  };

  const selectSession = (id: string) => {
    setActiveSessionId(id);
    setSessionIdInUrl(id);
  };

  const handleSessionReady = useCallback(
    (id: string) => {
      setActiveSessionId(id);
      setSessionIdInUrl(id);
      fetchSessions();
    },
    [fetchSessions],
  );

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-64 shrink-0 border-r border-border bg-card flex flex-col">
        <div className="px-4 py-4 border-b border-border">
          <h1 className="text-lg font-semibold text-primary">Codia</h1>
        </div>
        <div className="p-3">
          <Button
            onClick={startNewSession}
            className="w-full justify-start gap-2"
            variant="outline"
          >
            <Plus className="size-4" />
            New Chat
          </Button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-3">
          <div className="flex flex-col gap-0.5 pb-3">
            {sessions.map((s) => (
              <button
                key={s.sessionId}
                onClick={() => selectSession(s.sessionId)}
                className={`flex items-center gap-2 w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
                  activeSessionId === s.sessionId
                    ? "bg-muted font-medium"
                    : "text-muted-foreground"
                }`}
              >
                <MessageSquare className="size-4 shrink-0" />
                <span className="truncate">
                  {s.title || s.sessionId.slice(0, 8)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 min-w-0">
        <ChatInner
          key={activeSessionId ?? `new-${newSessionKey}`}
          sessionId={activeSessionId}
          onSessionReady={handleSessionReady}
          onDebugInfo={import.meta.env.DEV ? setChatDebug : undefined}
        />
      </div>

      {import.meta.env.DEV && chatDebug && (
        <DebugPanel
          data={{
            activeSessionId: activeSessionId ?? "(new session)",
            sessionCount: sessions.length,
            "agent.status": chatDebug.status,
            "agent.sessionId": chatDebug.sessionId,
            "agent.error": chatDebug.error,
            "agent.messageCount": chatDebug.messageCount,
            "agent.selectedModel": chatDebug.selectedModel,
            "agent.lastMessageRole": chatDebug.lastMessageRole ?? "none",
            "agent.models": chatDebug.models,
            "agent.messages": chatDebug.messages,
          }}
        />
      )}

      <AcpInspector />
    </div>
  );
}
