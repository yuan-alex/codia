import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus } from "lucide-react";

type SessionListItem = {
  sessionId: string;
  cwd?: string;
  title?: string;
  lastUpdated?: string;
};

export function SessionPicker({ navigate }: { navigate: (to: string) => void }) {
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
      <header className="flex items-center gap-2.5 px-6 py-3.5 border-b border-border bg-card">
        <h1 className="text-lg font-semibold text-primary">Codia</h1>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-6 flex flex-col gap-5">
          <Button size="lg" onClick={() => navigate("/session/new")} className="w-full">
            <Plus className="size-4" />
            New Session
          </Button>

          <Separator />

          {loading && (
            <p className="text-sm text-muted-foreground px-0.5">
              Loading sessions...
            </p>
          )}
          {!loading && pastSessions.length === 0 && (
            <p className="text-sm text-muted-foreground px-0.5">
              No previous sessions found
            </p>
          )}
          {pastSessions.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground px-0.5">
                Recent sessions
              </p>
              {pastSessions.map((s) => (
                <Card
                  key={s.sessionId}
                  className="cursor-pointer transition-colors hover:border-primary hover:bg-accent"
                  onClick={() => navigate(`/session/${s.sessionId}`)}
                >
                  <CardContent className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm font-medium flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                      {s.title || s.sessionId.slice(0, 8)}
                    </span>
                    <span className="flex gap-2 items-center shrink-0 ml-3">
                      {s.cwd && (
                        <Badge variant="secondary" className="text-[11px]">
                          {s.cwd.split("/").pop()}
                        </Badge>
                      )}
                      {s.lastUpdated && (
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(s.lastUpdated).toLocaleDateString()}
                        </span>
                      )}
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
