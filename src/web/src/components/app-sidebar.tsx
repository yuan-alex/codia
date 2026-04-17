import { MessageSquare, MoonIcon, Plus, SunIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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

interface SessionListItem {
  cwd?: string;
  lastUpdated?: string;
  sessionId: string;
  title?: string;
}

export function AppSidebar({
  activeSessionId,
  isDark,
  onNewSession,
  onSelectSession,
  onToggleTheme,
  ...props
}: {
  activeSessionId: string | null;
  isDark: boolean;
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
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
  }, [fetchSessions]);

  return (
    <Sidebar className="border-r-0" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="w-fit px-1.5">
              <span className="font-medium text-xl">Codia</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <Button
          className="w-full justify-start gap-2"
          onClick={onNewSession}
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
                      isActive={activeSessionId === s.sessionId}
                      onClick={() => onSelectSession(s.sessionId)}
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
            <SidebarMenuButton
              onClick={onToggleTheme}
              tooltip={isDark ? "Light mode" : "Dark mode"}
            >
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
