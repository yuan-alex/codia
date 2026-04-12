import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";

import { ChatInner, type ChatDebugInfo } from "./components/chat-inner";
import { DebugPanel } from "./components/debug-panel";
import { AcpInspector } from "./components/acp-inspector";
import { Plus, MessageSquare, SparklesIcon, SunIcon, MoonIcon, BotIcon, CodeIcon } from "lucide-react";
import type { BackendType } from "./hooks/use-agent";

function useTheme() {
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem("theme");
    if (stored) return stored === "dark";
    return document.documentElement.classList.contains("dark");
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  return { isDark, toggle: () => setIsDark((v) => !v) };
}

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
  const { isDark, toggle: toggleTheme } = useTheme();
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    getSessionIdFromUrl,
  );
  const [newSessionKey, setNewSessionKey] = useState(0);
  const [backend, setBackend] = useState<BackendType>("acp");
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
        <div className="px-4 py-4 border-b border-border flex items-center gap-2.5">
          <div className="relative flex size-7 items-center justify-center rounded-lg border border-[#d97757]/30 bg-gradient-to-br from-[#d97757]/20 to-[#d97757]/5">
            <SparklesIcon className="size-3.5 text-[#d97757]" strokeWidth={2} />
          </div>
          <div className="flex flex-col leading-tight flex-1 min-w-0">
            <h1 className="text-sm font-semibold tracking-tight">Codia</h1>
            <span className="text-[10px] text-muted-foreground uppercase tracking-[0.12em] font-medium">
              {backend === "acp" ? "Claude Code" : "Codia Agent"}
            </span>
          </div>
          <button
            onClick={() => {
              const next = backend === "acp" ? "codia" : "acp";
              setBackend(next);
              startNewSession();
            }}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={backend === "acp" ? "Switch to Codia Agent" : "Switch to Claude Code"}
            title={backend === "acp" ? "Switch to Codia Agent" : "Switch to Claude Code"}
          >
            {backend === "acp" ? <BotIcon className="size-3.5" /> : <CodeIcon className="size-3.5" />}
          </button>
          <button
            onClick={toggleTheme}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? <SunIcon className="size-3.5" /> : <MoonIcon className="size-3.5" />}
          </button>
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
          key={activeSessionId ?? `new-${newSessionKey}-${backend}`}
          sessionId={activeSessionId}
          backend={backend}
          onSessionReady={handleSessionReady}
          onPromptDone={fetchSessions}
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
          }}
        />
      )}

      <AcpInspector />
    </div>
  );
}
