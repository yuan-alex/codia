import { useCallback, useEffect, useState } from "react";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "./components/app-sidebar";
import { type ChatDebugInfo, ChatInner } from "./components/chat-inner";
import { DebugPanel } from "./components/debug-panel";

function useTheme() {
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem("theme");
    if (stored) {
      return stored === "dark";
    }
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
    getSessionIdFromUrl
  );
  const [newSessionKey, setNewSessionKey] = useState(0);
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

  const handleSessionReady = useCallback((id: string) => {
    setActiveSessionId(id);
    setSessionIdInUrl(id);
  }, []);

  return (
    <SidebarProvider className="!min-h-0 h-svh">
      <AppSidebar
        activeSessionId={activeSessionId}
        isDark={isDark}
        onNewSession={startNewSession}
        onSelectSession={selectSession}
        onToggleTheme={toggleTheme}
      />
      <SidebarInset className="overflow-hidden">
        <header className="flex h-11 shrink-0 items-center gap-2 px-3">
          <SidebarTrigger className="-ml-1" />
        </header>
        <div className="min-h-0 flex-1">
          <ChatInner
            key={activeSessionId ?? `new-${newSessionKey}`}
            onDebugInfo={import.meta.env.DEV ? setChatDebug : undefined}
            onSessionReady={handleSessionReady}
            sessionId={activeSessionId}
          />
        </div>
      </SidebarInset>

      {import.meta.env.DEV && chatDebug && <DebugPanel data={chatDebug} />}
    </SidebarProvider>
  );
}
