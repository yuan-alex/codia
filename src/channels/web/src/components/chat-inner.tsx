import { useState, useEffect, useRef } from "react";
import { SparklesIcon } from "lucide-react";
import { useAgent, type AgentMessage } from "@/hooks/use-agent";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  type PromptInputMessage,
  PromptInputTextarea,
  PromptInputSubmit,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputBody,
} from "@/components/ai-elements/prompt-input";
import { ToolDisplay } from "@/components/ai-elements/tool-renderers";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Spinner } from "@/components/ui/spinner";

function MessageParts({
  message,
  isLastMessage,
  isStreaming,
}: {
  message: AgentMessage;
  isLastMessage: boolean;
  isStreaming: boolean;
}) {
  const reasoningParts = message.parts.filter(
    (part) => part.type === "reasoning",
  );
  const reasoningText = reasoningParts.map((part) => part.text).join("\n\n");
  const hasReasoning = reasoningParts.length > 0;

  const lastPart = message.parts.at(-1);
  const isReasoningStreaming =
    isLastMessage && isStreaming && lastPart?.type === "reasoning";

  return (
    <>
      {hasReasoning && (
        <Reasoning className="w-full" isStreaming={isReasoningStreaming}>
          <ReasoningTrigger />
          <ReasoningContent>{reasoningText}</ReasoningContent>
        </Reasoning>
      )}
      {message.parts.map((part, i) => {
        if (part.type === "text") {
          return (
            <MessageResponse key={`${message.id}-text-${i}`}>
              {part.text}
            </MessageResponse>
          );
        }

        if (part.type === "dynamic-tool") {
          return (
            <ToolDisplay key={`${message.id}-tool-${i}`} part={part} />
          );
        }

        return null;
      })}
    </>
  );
}

export type ChatDebugInfo = {
  status: string;
  error: string | null;
  messageCount: number;
  selectedModel: string;
  models: string[];
  lastMessageRole?: string;
  messages: AgentMessage[];
  sessionId: string | null;
};

export function ChatInner({
  sessionId,
  onSessionReady,
  onPromptDone,
  onDebugInfo,
}: {
  sessionId: string | null;
  onSessionReady?: (id: string) => void;
  onPromptDone?: () => void;
  onDebugInfo?: (info: ChatDebugInfo) => void;
}) {
  const [input, setInput] = useState("");
  const agent = useAgent(sessionId);
  const prevStatusRef = useRef(agent.status);

  // Notify parent when session is resolved
  useEffect(() => {
    if (agent.sessionId && agent.sessionId !== sessionId) {
      onSessionReady?.(agent.sessionId);
    }
  }, [agent.sessionId]);

  // Notify parent when a prompt completes
  useEffect(() => {
    if (prevStatusRef.current === "streaming" && agent.status === "ready") {
      onPromptDone?.();
    }
    prevStatusRef.current = agent.status;
  }, [agent.status]);

  // Debug info
  useEffect(() => {
    onDebugInfo?.({
      status: agent.status,
      error: agent.error,
      messageCount: agent.messages.length,
      selectedModel: agent.selectedModel,
      models: agent.models.map((m) => m.modelId),
      lastMessageRole: agent.messages.at(-1)?.role,
      messages: agent.messages,
      sessionId: agent.sessionId,
    });
  }, [agent.status, agent.messages.length, agent.selectedModel, agent.error]);

  const isStreaming = agent.status === "streaming";
  const isLoading = agent.status === "loading";
  const isReady = agent.status === "ready";

  const handleSubmit = (message: PromptInputMessage) => {
    if (!message.text.trim()) return;
    agent.sendMessage(message.text);
    setInput("");
  };

  if (agent.status === "error" && agent.messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-destructive text-sm">
          Failed to connect: {agent.error}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {isLoading && (
        <div className="h-0.5 w-full overflow-hidden bg-muted">
          <div className="h-full w-1/3 animate-[shimmer_1.5s_ease-in-out_infinite] bg-primary/40 rounded-full" />
        </div>
      )}
      <Conversation>
        <ConversationContent>
          {agent.messages.length === 0 && !isLoading ? (
            <ConversationEmptyState
              title="How can I help?"
              description="Ask me anything about your codebase."
            />
          ) : (
            <>
              {isLoading && (
                <div className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground">
                  <Spinner className="size-3" />
                  <span>Restoring conversation...</span>
                </div>
              )}
              {agent.messages.map((message, index) => (
                <Message from={message.role} key={message.id}>
                  <MessageContent>
                    <MessageParts
                      message={message}
                      isLastMessage={index === agent.messages.length - 1}
                      isStreaming={isStreaming}
                    />
                  </MessageContent>
                </Message>
              ))}
            </>
          )}

          {isStreaming &&
            agent.messages[agent.messages.length - 1]?.role !== "assistant" && (
              <Spinner />
            )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <PromptInput
        onSubmit={handleSubmit}
        className="mt-4 w-full max-w-4xl mx-auto px-4 pb-4"
      >
        <PromptInputBody>
          <PromptInputTextarea
            value={input}
            placeholder={isLoading ? "Loading conversation..." : isReady ? "Message Codia..." : "Thinking..."}
            onChange={(e) => setInput(e.currentTarget.value)}
            disabled={!isReady}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            {agent.models.length > 0 && (
              <PromptInputSelect
                value={agent.selectedModel}
                onValueChange={agent.changeModel}
                disabled={isStreaming}
              >
                <PromptInputSelectTrigger className="h-8 gap-1.5 rounded-lg px-2.5 text-xs">
                  <SparklesIcon className="size-3.5 text-muted-foreground" />
                  <PromptInputSelectValue />
                </PromptInputSelectTrigger>
                <PromptInputSelectContent align="start">
                  {agent.models.map((m) => (
                    <PromptInputSelectItem key={m.modelId} value={m.modelId}>
                      {m.name}
                    </PromptInputSelectItem>
                  ))}
                </PromptInputSelectContent>
              </PromptInputSelect>
            )}
          </PromptInputTools>
          <PromptInputSubmit
            status={isStreaming ? "streaming" : "ready"}
            disabled={!input.trim() || !isReady}
          />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
