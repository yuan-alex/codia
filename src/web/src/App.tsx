import { useState, useEffect, useCallback } from "react";

import { ChatInner, type ChatDebugInfo } from "./components/chat-inner";
import { DebugPanel } from "./components/debug-panel";
import { AppSidebar } from "./components/app-sidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
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
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    getSessionIdFromUrl,
  );
  const [newSessionKey, setNewSessionKey] = useState(0);
  const [backend, setBackend] = useState<BackendType>("acp");
  const [chatDebug, setChatDebug] = useState<ChatDebugInfo | null>(null);

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
    },
    [],
  );

  const handleToggleBackend = () => {
    setBackend((b) => (b === "acp" ? "codia" : "acp"));
    startNewSession();
  };

  return (
    <SidebarProvider className="h-svh !min-h-0">
      <AppSidebar
        activeSessionId={activeSessionId}
        backend={backend}
        isDark={isDark}
        onNewSession={startNewSession}
        onSelectSession={selectSession}
        onToggleBackend={handleToggleBackend}
        onToggleTheme={toggleTheme}
      />
      <SidebarInset className="overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <span className="text-sm text-muted-foreground">
            {activeSessionId ? "Chat" : "New Chat"}
          </span>
        </header>
        <div className="flex-1 min-h-0">
          <ChatInner
            key={activeSessionId ?? `new-${newSessionKey}-${backend}`}
            sessionId={activeSessionId}
            backend={backend}
            onSessionReady={handleSessionReady}
            onDebugInfo={import.meta.env.DEV ? setChatDebug : undefined}
          />
        </div>
      </SidebarInset>

      {import.meta.env.DEV && chatDebug && (
        <DebugPanel data={chatDebug} />
      )}
    </SidebarProvider>
  );
}
