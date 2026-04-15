import { memo, useState, useEffect, useMemo, useRef } from "react";
import {
  SparklesIcon,
  GitBranchIcon,
  FolderIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  LoaderIcon,
  CheckCircle2Icon,
  CircleXIcon,
} from "lucide-react";
import {
  useAgent,
  type AgentMessage,
} from "@/hooks/use-agent";
import { useSlashCommands } from "@/hooks/use-slash-commands";
import { SlashCommandMenu } from "@/components/slash-command-menu";

import {
  Conversation,
  ConversationContent,
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
  PromptInputBody,
} from "@/components/ai-elements/prompt-input";
import {
  ModelSelector,
  ModelSelectorTrigger,
  ModelSelectorContent,
  ModelSelectorInput,
  ModelSelectorList,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorItem,
  ModelSelectorLogo,
  ModelSelectorName,
} from "@/components/ai-elements/model-selector";
import { Button } from "@/components/ui/button";
import { ToolDisplay } from "@/components/ai-elements/tool-renderers";

/** Extract provider name from a model ID like "anthropic:claude-sonnet-4-20250514" or "claude-sonnet-4-20250514" */
function getProvider(modelId: string): string {
  if (modelId.includes(":")) return modelId.split(":")[0];
  if (modelId.startsWith("claude")) return "anthropic";
  if (modelId.startsWith("gpt") || modelId.startsWith("o1") || modelId.startsWith("o3") || modelId.startsWith("o4")) return "openai";
  if (modelId.startsWith("gemini")) return "google";
  if (modelId.startsWith("mistral")) return "mistral";
  if (modelId.startsWith("deepseek")) return "deepseek";
  return "openai";
}

// Memoized wrapper around the (non-memoized) vendored ToolDisplay. When
// use-agent preserves part identity across streaming flushes, unchanged tool
// subtrees bail out of re-render entirely — which also avoids the O(m·n) LCS
// computation inside DiffContent on every chunk.
type ToolPartProp = Extract<
  AgentMessage["parts"][number],
  { type: "dynamic-tool" }
>;
const MemoToolDisplay = memo(
  function MemoToolDisplay({ part }: { part: ToolPartProp }) {
    return <ToolDisplay part={part} />;
  },
  (prev, next) => prev.part === next.part,
);
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import {
  Task,
  TaskTrigger,
  TaskContent,
} from "@/components/ai-elements/task";
import { Spinner } from "@/components/ui/spinner";

type Workspace = {
  cwd: string;
  displayPath: string;
  basename: string;
  branch: string | null;
};

const SUGGESTIONS = [
  {
    title: "Explore the codebase",
    prompt:
      "Give me a tour of this repository — the main entry points, the architecture, and what each top-level directory is responsible for.",
  },
  {
    title: "Hunt down a bug",
    prompt:
      "I'm seeing an unexpected behavior in this project. Help me trace it — ask me for details and then investigate the relevant files.",
  },
  {
    title: "Refactor a module",
    prompt:
      "Look for duplication or tangled logic I should clean up, then propose a refactor with concrete diffs.",
  },
  {
    title: "Write tests",
    prompt:
      "Find the most valuable untested code paths in this repo and write tests for them.",
  },
];

function EmptyState({
  onSuggestion,
}: {
  onSuggestion: (text: string) => void;
}) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);

  useEffect(() => {
    fetch("/api/workspace")
      .then((r) => r.json())
      .then((data) => setWorkspace(data))
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col items-center justify-center gap-10 px-6 pb-16 w-full max-w-2xl mx-auto select-none">
      {/* Greeting */}
      <div className="flex flex-col items-center gap-4">
        <h2 className="text-2xl font-medium tracking-tight text-foreground/90">
          What can I help you build?
        </h2>
        {workspace && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
            <FolderIcon className="size-3" strokeWidth={1.5} />
            <span>{workspace.displayPath}</span>
            {workspace.branch && (
              <>
                <span className="mx-0.5 text-border">/</span>
                <GitBranchIcon className="size-3" strokeWidth={1.5} />
                <span>{workspace.branch}</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Suggestion pills */}
      <div className="flex flex-wrap items-center justify-center gap-2 max-w-lg">
        {SUGGESTIONS.map(({ title, prompt }) => (
          <button
            key={title}
            type="button"
            onClick={() => onSuggestion(prompt)}
            className="rounded-full border border-border/70 bg-card/50 px-4 py-2 text-sm text-muted-foreground transition-all duration-200 hover:border-[#da7756]/50 hover:text-foreground hover:bg-[#da7756]/5 hover:shadow-sm hover:shadow-[#da7756]/10 hover:-translate-y-px active:translate-y-0 active:shadow-none"
          >
            {title}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Group consecutive parts of the same type into segments for rendering. */
type Segment =
  | { type: "text"; parts: { text: string; index: number }[] }
  | { type: "tools"; parts: { part: ToolPartProp; index: number }[] };

function groupParts(parts: AgentMessage["parts"]): Segment[] {
  const segments: Segment[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.type === "reasoning") continue; // handled separately
    if (part.type === "text") {
      const last = segments[segments.length - 1];
      if (last?.type === "text") {
        last.parts.push({ text: part.text, index: i });
      } else {
        segments.push({ type: "text", parts: [{ text: part.text, index: i }] });
      }
    } else if (part.type === "dynamic-tool") {
      const last = segments[segments.length - 1];
      if (last?.type === "tools") {
        last.parts.push({ part, index: i });
      } else {
        segments.push({ type: "tools", parts: [{ part, index: i }] });
      }
    }
  }
  return segments;
}

const ToolGroupSummary = memo(function ToolGroupSummary({ tools }: { tools: ToolPartProp[] }) {
  const completed = tools.filter((t) => t.state === "completed").length;
  const failed = tools.filter((t) => t.state === "failed").length;
  const active = tools.some(
    (t) => t.state === "pending" || t.state === "in_progress",
  );

  if (active) {
    return (
      <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
        <LoaderIcon className="size-3 animate-spin text-blue-500" />
        {completed}/{tools.length}
      </span>
    );
  }
  if (failed > 0) {
    return (
      <span className="ml-auto flex items-center gap-1.5 text-xs text-destructive">
        <CircleXIcon className="size-3" />
        {failed} failed
      </span>
    );
  }
  return (
    <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
      <CheckCircle2Icon className="size-3 text-green-500" />
      {completed} done
    </span>
  );
});

const ToolGroup = memo(function ToolGroup({
  tools,
  messageId,
  isActive,
}: {
  tools: { part: ToolPartProp; index: number }[];
  messageId: string;
  isActive: boolean;
}) {
  if (tools.length === 1) {
    return (
      <MemoToolDisplay
        key={`${messageId}-tool-${tools[0].index}`}
        part={tools[0].part}
      />
    );
  }

  const allParts = tools.map((t) => t.part);
  const label = `${tools.length} actions`;

  return (
    <Task defaultOpen={isActive} className="w-full">
      <TaskTrigger title={label}>
        <div className="flex w-full cursor-pointer items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm transition-colors hover:bg-accent/50">
          <SparklesIcon className="size-4 text-muted-foreground" />
          <span className="font-medium">{label}</span>
          <ToolGroupSummary tools={allParts} />
        </div>
      </TaskTrigger>
      <TaskContent>
        {tools.map(({ part, index }) => (
          <MemoToolDisplay key={`${messageId}-tool-${index}`} part={part} />
        ))}
      </TaskContent>
    </Task>
  );
});

const MessageParts = memo(function MessageParts({
  message,
  isLastMessage,
  isStreaming,
}: {
  message: AgentMessage;
  isLastMessage: boolean;
  isStreaming: boolean;
}) {
  // Memoized: runs only when parts[] changes identity.
  const reasoningText = useMemo(
    () =>
      message.parts
        .filter((part) => part.type === "reasoning")
        .map((part) => part.text)
        .join("\n\n"),
    [message.parts],
  );
  const hasReasoning = reasoningText.length > 0;

  const lastPart = message.parts.at(-1);
  const isReasoningStreaming =
    isLastMessage && isStreaming && lastPart?.type === "reasoning";

  const segments = useMemo(() => groupParts(message.parts), [message.parts]);

  return (
    <>
      {hasReasoning && (
        <Reasoning className="w-full" isStreaming={isReasoningStreaming}>
          <ReasoningTrigger />
          <ReasoningContent>{reasoningText}</ReasoningContent>
        </Reasoning>
      )}
      {segments.map((segment, si) => {
        if (segment.type === "text") {
          return segment.parts.map(({ text, index }) => (
            <MessageResponse key={`${message.id}-text-${index}`}>
              {text}
            </MessageResponse>
          ));
        }
        // Tool group
        const hasActive = isLastMessage && isStreaming && segment.parts.some(
          ({ part }) => part.state === "pending" || part.state === "in_progress",
        );
        return (
          <ToolGroup
            key={`${message.id}-toolgroup-${si}`}
            tools={segment.parts}
            messageId={message.id}
            isActive={hasActive}
          />
        );
      })}
    </>
  );
});

export type ChatDebugInfo = {
  status: string;
  error: string | null;
  messageCount: number;
  selectedModel: string;
  models: string[];
  lastMessageRole?: string;
  sessionId: string | null;
  messages: AgentMessage[];
  rawMessages: unknown[];
  debugEvents: unknown[];
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
  const handleSuggestion = (text: string) => setInput(text);
  const prevStatusRef = useRef(agent.status);

  const slashCommands = useSlashCommands(input, {
    changeModel: agent.changeModel,
    setInput,
    addInfoMessage: agent.addInfoMessage,
    models: agent.models,
  });

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

  const messageCount = agent.messages.length;
  const lastMessageRole = agent.messages.at(-1)?.role;
  useEffect(() => {
    onDebugInfo?.({
      status: agent.status,
      error: agent.error,
      messageCount,
      selectedModel: agent.selectedModel,
      models: agent.models.map((m) => m.modelId),
      lastMessageRole,
      sessionId: agent.sessionId,
      messages: agent.messages,
      rawMessages: agent.rawMessages,
      debugEvents: agent.debugEvents,
    });
  }, [
    agent.status,
    agent.error,
    agent.selectedModel,
    agent.sessionId,
    agent.models,
    messageCount,
    lastMessageRole,
    agent.messages,
    agent.rawMessages,
    agent.debugEvents,
    onDebugInfo,
  ]);

  const isStreaming = agent.status === "streaming";
  const isLoading = agent.status === "loading";
  const isReady = agent.status === "ready";

  const handleSubmit = (message: PromptInputMessage) => {
    if (!message.text.trim()) return;
    // Try executing as a slash command first
    if (slashCommands.executeFromInput(message.text)) return;
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
      {agent.messages.length === 0 && !isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState onSuggestion={handleSuggestion} />
        </div>
      ) : (
        <Conversation>
          <ConversationContent>
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

            {isStreaming &&
              agent.messages[agent.messages.length - 1]?.role !==
                "assistant" && <Spinner />}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      )}

      <SlashCommandMenu
        isOpen={slashCommands.isOpen}
        commands={slashCommands.commands}
        onSelect={slashCommands.selectCommand}
      >
        <PromptInput
          onSubmit={handleSubmit}
          className="w-full max-w-4xl mx-auto px-4 pb-4"
        >
          <PromptInputBody>
            <PromptInputTextarea
              value={input}
              placeholder={
                isLoading
                  ? "Loading conversation..."
                  : isReady
                    ? "Message Claude..."
                    : "Thinking..."
              }
              onChange={(e) => setInput(e.currentTarget.value)}
              onKeyDown={slashCommands.handleKeyDown}
              disabled={!isReady}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              {agent.models.length > 0 && (
                <ModelSelector>
                  <ModelSelectorTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 rounded-lg px-2.5 text-xs"
                      disabled={isStreaming}
                    >
                      <ModelSelectorLogo
                        provider={getProvider(agent.selectedModel)}
                        className="size-3.5"
                      />
                      <span className="truncate max-w-32">
                        {agent.models.find((m) => m.modelId === agent.selectedModel)?.name ?? agent.selectedModel}
                      </span>
                      <ChevronsUpDownIcon className="size-3 text-muted-foreground" />
                    </Button>
                  </ModelSelectorTrigger>
                  <ModelSelectorContent>
                    <ModelSelectorInput placeholder="Search models..." />
                    <ModelSelectorList>
                      <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
                      <ModelSelectorGroup heading="Models">
                        {agent.models.map((m) => (
                          <ModelSelectorItem
                            key={m.modelId}
                            value={m.modelId}
                            onSelect={() => agent.changeModel(m.modelId)}
                            className="flex items-center gap-2"
                          >
                            <ModelSelectorLogo
                              provider={getProvider(m.modelId)}
                              className="size-4"
                            />
                            <ModelSelectorName>{m.name}</ModelSelectorName>
                            {m.modelId === agent.selectedModel && (
                              <CheckIcon className="size-3.5 text-primary" />
                            )}
                          </ModelSelectorItem>
                        ))}
                      </ModelSelectorGroup>
                    </ModelSelectorList>
                  </ModelSelectorContent>
                </ModelSelector>
              )}
            </PromptInputTools>
            <PromptInputSubmit
              status={isStreaming ? "streaming" : "ready"}
              disabled={!input.trim() || !isReady}
            />
          </PromptInputFooter>
        </PromptInput>
      </SlashCommandMenu>
    </div>
  );
}
