import { useState, useRef, useEffect, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import Markdown from "react-markdown";
import { Button } from "@/components/ui/button";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ArrowUp, ChevronRight } from "lucide-react";
import type { ChatDebugInfo } from "./chat-view";

type ModelInfo = {
  modelId: string;
  name: string;
  description?: string;
};

export function ChatInner({
  chatId,
  initialMessages,
  models,
  onDebugInfo,
}: {
  chatId?: string;
  initialMessages: any[];
  models: ModelInfo[];
  onDebugInfo?: (info: ChatDebugInfo) => void;
}) {
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState(models[0]?.modelId ?? "");
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages: msgs }) => ({
          body: {
            messages: msgs.length > 0 ? [msgs[msgs.length - 1]] : msgs,
          },
        }),
      }),
    []
  );

  const { messages, status, sendMessage } = useChat({
    id: chatId,
    transport,
    messages: initialMessages.length > 0 ? initialMessages : undefined,
  });

  const isReady = status === "ready";
  const isStreaming = status === "streaming";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    onDebugInfo?.({
      status,
      messageCount: messagesRef.current.length,
      selectedModel,
      models: models.map((m) => m.modelId),
      lastMessageRole: messagesRef.current.at(-1)?.role,
      historyLength: initialMessages.length,
      messages: messagesRef.current,
    });
  }, [status, messages.length, selectedModel]);

  const handleModelChange = async (modelId: string) => {
    setSelectedModel(modelId);
    try {
      await fetch("/api/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId }),
      });
    } catch (err) {
      console.error("Failed to set model:", err);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !isReady) return;
    sendMessage({ text: input });
    setInput("");
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
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header bar with model selector */}
      {models.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
          <Select value={selectedModel} onValueChange={handleModelChange} disabled={isStreaming}>
            <SelectTrigger className="w-auto text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m.modelId} value={m.modelId} className="text-xs">
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span
            className={`ml-auto w-2 h-2 rounded-full shrink-0 ${
              isStreaming
                ? "bg-primary animate-pulse"
                : isReady
                  ? "bg-green-500"
                  : "bg-muted-foreground"
            }`}
          />
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-6">
          {messages.length === 0 && isReady && (
            <div className="flex flex-col items-center justify-center mt-[28vh] text-center">
              <h2 className="text-xl font-semibold text-foreground mb-2">How can I help?</h2>
              <p className="text-sm text-muted-foreground">Ask me anything about your codebase.</p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex flex-col gap-1 ${message.role === "user" ? "items-end" : "items-start"}`}
            >
              <span className="text-xs text-muted-foreground px-1 mb-0.5">
                {message.role === "user" ? "You" : "Assistant"}
              </span>
              <div
                className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-muted rounded-bl-md"
                }`}
              >
                {message.parts.map((part, i) => {
                  if (part.type === "reasoning") {
                    const key = `${message.id}-reasoning-${i}`;
                    const isExpanded = expandedTools.has(key);
                    return (
                      <Collapsible key={i} open={isExpanded} onOpenChange={() => toggleTool(key)}>
                        <div className="my-1.5 p-2 px-3 bg-background/50 border border-border rounded-lg text-[13px]">
                          <CollapsibleTrigger className="flex items-center gap-1.5 cursor-pointer select-none w-full text-left bg-transparent border-none p-0">
                            <ChevronRight
                              className={`size-3 text-muted-foreground transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
                            />
                            <span className="text-xs italic text-muted-foreground">Thinking...</span>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="mt-2 pt-2 border-t border-border text-[13px] text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
                              {part.text}
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    );
                  }

                  if (part.type === "text") {
                    if (message.role === "user") {
                      return <span key={i}>{part.text}</span>;
                    }
                    return (
                      <div
                        key={i}
                        className="prose prose-sm prose-neutral dark:prose-invert max-w-none [&_code]:bg-background [&_code]:border [&_code]:border-border [&_code]:rounded [&_code]:px-1.5 [&_code]:py-px [&_code]:font-mono [&_code]:text-xs [&_pre]:bg-background [&_pre]:border [&_pre]:border-border [&_pre]:rounded-md [&_pre]:p-3 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:border-0 [&_pre_code]:p-0"
                      >
                        <Markdown>{part.text}</Markdown>
                      </div>
                    );
                  }

                  if (part.type === "dynamic-tool") {
                    const isExpanded = expandedTools.has(part.toolCallId);
                    const isDone = part.state === "output-available";
                    return (
                      <Collapsible key={i} open={isExpanded} onOpenChange={() => toggleTool(part.toolCallId)}>
                        <div className="my-2 p-2.5 px-3.5 bg-background/50 border border-border rounded-lg text-[13px]">
                          <CollapsibleTrigger className="flex items-center gap-1.5 cursor-pointer select-none w-full text-left bg-transparent border-none p-0">
                            <ChevronRight
                              className={`size-3 text-muted-foreground transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
                            />
                            <span className="font-medium text-xs">{part.toolName}</span>
                            <Badge variant={isDone ? "secondary" : "outline"} className="ml-auto text-[10px]">
                              {isDone ? "done" : "running"}
                            </Badge>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            {isDone && part.output && (
                              <pre className="mt-2 pt-2 border-t border-border font-mono text-xs text-muted-foreground max-h-[200px] overflow-y-auto whitespace-pre-wrap leading-relaxed">
                                {typeof part.output === "string"
                                  ? part.output
                                  : JSON.stringify(part.output, null, 2)}
                              </pre>
                            )}
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    );
                  }

                  return null;
                })}
              </div>
            </div>
          ))}

          {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm pl-1">
              <div className="flex gap-[3px]">
                <span className="w-[5px] h-[5px] rounded-full bg-muted-foreground opacity-40 animate-[bounce-dot_1.2s_infinite]" />
                <span className="w-[5px] h-[5px] rounded-full bg-muted-foreground opacity-40 animate-[bounce-dot_1.2s_infinite_0.15s]" />
                <span className="w-[5px] h-[5px] rounded-full bg-muted-foreground opacity-40 animate-[bounce-dot_1.2s_infinite_0.3s]" />
              </div>
              Thinking...
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-border p-4">
        <form
          onSubmit={handleSubmit}
          className="max-w-3xl mx-auto relative"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder={isReady ? "Message Codia..." : "Thinking..."}
            disabled={!isReady}
            autoFocus
            rows={1}
            className="w-full resize-none rounded-xl border border-border bg-muted/50 px-4 py-3 pr-12 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!isReady || !input.trim()}
            className="absolute right-2 bottom-2 rounded-lg"
          >
            <ArrowUp className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
