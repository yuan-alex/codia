import { useState, useEffect } from "react";
import { ChatInner } from "./chat-inner";

type ModelInfo = {
  modelId: string;
  name: string;
  description?: string;
};

export type ChatDebugInfo = {
  status: string;
  messageCount: number;
  selectedModel: string;
  models: string[];
  lastMessageRole?: string;
  historyLength: number;
  messages: any[];
};

export function ChatView({
  sessionId,
  onDebugInfo,
}: {
  sessionId: string | null;
  onDebugInfo?: (info: ChatDebugInfo | null) => void;
}) {
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
      <div className="flex h-full items-center justify-center">
        <p className="text-destructive text-sm">Failed to connect</p>
      </div>
    );
  }

  if (!sessionData) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground text-sm">Connecting...</p>
      </div>
    );
  }

  return (
    <ChatInner
      chatId={sessionId ?? undefined}
      initialMessages={sessionData.history}
      models={sessionData.models}
      onDebugInfo={onDebugInfo}
    />
  );
}
