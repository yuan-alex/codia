import { useCallback, useEffect, useState } from "react";
import {
  SparklesIcon,
  Plus,
  MessageSquare,
  SunIcon,
  MoonIcon,
  BotIcon,
  CodeIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import type { BackendType } from "@/hooks/use-agent";

type SessionListItem = {
  sessionId: string;
  cwd?: string;
  title?: string;
  lastUpdated?: string;
};

export function AppSidebar({
  activeSessionId,
  backend,
  isDark,
  onNewSession,
  onSelectSession,
  onToggleBackend,
  onToggleTheme,
  ...props
}: {
  activeSessionId: string | null;
  backend: BackendType;
  isDark: boolean;
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
  onToggleBackend: () => void;
  onToggleTheme: () => void;
} & React.ComponentProps<typeof Sidebar>) {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);

  const fetchSessions = useCallback(() => {
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data) => setSessions(data.sessions || []))
      .catch((err) => console.error("Failed to fetch sessions:", err));
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Re-fetch when active session changes (new session created, prompt done, etc.)
  useEffect(() => {
    fetchSessions();
  }, [activeSessionId, fetchSessions]);

  return (
    <Sidebar className="border-r-0" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="w-fit px-1.5">
              <div className="flex aspect-square size-5 items-center justify-center rounded-md border border-[#d97757]/30 bg-gradient-to-br from-[#d97757]/20 to-[#d97757]/5">
                <SparklesIcon className="size-3 text-[#d97757]" strokeWidth={2} />
              </div>
              <span className="truncate font-medium">Codia</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-[0.12em] font-medium">
                {backend === "acp" ? "Claude Code" : "Codia Agent"}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <Button
          onClick={onNewSession}
          className="w-full justify-start gap-2"
          variant="outline"
        >
          <Plus className="size-4" />
          New Chat
        </Button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Chats</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {sessions
                .filter((s) => s.title)
                .map((s) => (
                  <SidebarMenuItem key={s.sessionId}>
                    <SidebarMenuButton
                      onClick={() => onSelectSession(s.sessionId)}
                      isActive={activeSessionId === s.sessionId}
                      tooltip={s.title || s.sessionId.slice(0, 8)}
                    >
                      <MessageSquare />
                      <span>{s.title || s.sessionId.slice(0, 8)}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarSeparator />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onToggleBackend} tooltip={backend === "acp" ? "Switch to Codia Agent" : "Switch to Claude Code"}>
              {backend === "acp" ? <BotIcon /> : <CodeIcon />}
              <span>{backend === "acp" ? "Switch to Codia Agent" : "Switch to Claude Code"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onToggleTheme} tooltip={isDark ? "Light mode" : "Dark mode"}>
              {isDark ? <SunIcon /> : <MoonIcon />}
              <span>{isDark ? "Light mode" : "Dark mode"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
