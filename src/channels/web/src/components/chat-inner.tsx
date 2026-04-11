import { useState, useRef, useEffect, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";

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
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolOutput,
} from "@/components/ai-elements/tool";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Spinner } from "@/components/ui/spinner";
import type { ChatDebugInfo } from "./chat-view";

type ModelInfo = {
  modelId: string;
  name: string;
  description?: string;
};

function MessageParts({
  message,
  isLastMessage,
  isStreaming,
}: {
  message: UIMessage;
  isLastMessage: boolean;
  isStreaming: boolean;
}) {
  const reasoningParts = message.parts.filter(
    (part) => part.type === "reasoning"
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
          const isDone = part.state === "output-available";
          return (
            <Tool key={`${message.id}-tool-${i}`} defaultOpen={false}>
              <ToolHeader type={`tool-${part.toolName}`} state={part.state} toolName={part.toolName} />
              <ToolContent>
                <ToolOutput output={isDone ? part.output : undefined} />
              </ToolContent>
            </Tool>
          );
        }

        return null;
      })}
    </>
  );
}

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

  const isStreaming = status === "streaming";

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

  const handleSubmit = (message: PromptInputMessage) => {
    if (!message.text.trim()) return;
    sendMessage({ text: message.text });
    setInput("");
  };

  return (
    <div className="flex flex-col h-full">
      <Conversation>
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              title="How can I help?"
              description="Ask me anything about your codebase."
            />
          ) : (
            messages.map((message, index) => (
              <Message from={message.role} key={message.id}>
                <MessageContent>
                  <MessageParts
                    message={message}
                    isLastMessage={index === messages.length - 1}
                    isStreaming={isStreaming}
                  />
                </MessageContent>
              </Message>
            ))
          )}

          {status === "submitted" && <Spinner />}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <PromptInput
        onSubmit={handleSubmit}
        className="mt-4 w-full max-w-3xl mx-auto px-4 pb-4"
      >
        <PromptInputBody>
          <PromptInputTextarea
            value={input}
            placeholder={status === "ready" ? "Message Codia..." : "Thinking..."}
            onChange={(e) => setInput(e.currentTarget.value)}
            disabled={!status || status === "submitted"}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            {models.length > 0 && (
              <PromptInputSelect
                value={selectedModel}
                onValueChange={handleModelChange}
                disabled={isStreaming}
              >
                <PromptInputSelectTrigger>
                  <PromptInputSelectValue />
                </PromptInputSelectTrigger>
                <PromptInputSelectContent>
                  {models.map((m) => (
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
            disabled={!input.trim() && status === "ready"}
          />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
