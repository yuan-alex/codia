import { memo, useState, useEffect, useMemo, useRef } from "react";
import {
  SparklesIcon,
  FileSearchIcon,
  BugIcon,
  GitBranchIcon,
  TestTube2Icon,
  FolderIcon,
  CornerDownLeftIcon,
  CommandIcon,
} from "lucide-react";
import { useAgent, type AgentMessage, type BackendType } from "@/hooks/use-agent";

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
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputBody,
} from "@/components/ai-elements/prompt-input";
import { ToolDisplay } from "@/components/ai-elements/tool-renderers";

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
import { Spinner } from "@/components/ui/spinner";

type Workspace = {
  cwd: string;
  displayPath: string;
  basename: string;
  branch: string | null;
};

const SUGGESTIONS: {
  icon: typeof FileSearchIcon;
  title: string;
  prompt: string;
}[] = [
  {
    icon: FileSearchIcon,
    title: "Explore the codebase",
    prompt: "Give me a tour of this repository — the main entry points, the architecture, and what each top-level directory is responsible for.",
  },
  {
    icon: BugIcon,
    title: "Hunt down a bug",
    prompt: "I'm seeing an unexpected behavior in this project. Help me trace it — ask me for details and then investigate the relevant files.",
  },
  {
    icon: GitBranchIcon,
    title: "Refactor a module",
    prompt: "Look for duplication or tangled logic I should clean up, then propose a refactor with concrete diffs.",
  },
  {
    icon: TestTube2Icon,
    title: "Write tests",
    prompt: "Find the most valuable untested code paths in this repo and write tests for them.",
  },
];

function EmptyState({ onSuggestion }: { onSuggestion: (text: string) => void }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);

  useEffect(() => {
    fetch("/api/workspace")
      .then((r) => r.json())
      .then((data) => setWorkspace(data))
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col items-center justify-center gap-8 px-6 pb-12 w-full max-w-2xl mx-auto">
      {/* Brand mark */}
      <div className="flex flex-col items-center gap-5">
        <div className="relative flex items-center justify-center">
          <div className="absolute size-24 rounded-full bg-[#d97757]/10 blur-2xl" />
          <div className="absolute size-16 rounded-full bg-[#d97757]/15 blur-xl" />
          <div className="relative size-14 rounded-2xl border border-[#d97757]/30 bg-gradient-to-br from-[#d97757]/20 to-[#d97757]/5 flex items-center justify-center shadow-lg shadow-[#d97757]/10">
            <SparklesIcon className="size-6 text-[#d97757]" strokeWidth={1.75} />
          </div>
        </div>

        <div className="flex flex-col items-center gap-2.5">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#d97757]/30 bg-[#d97757]/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-[#d97757] font-semibold">
            <span className="size-1 rounded-full bg-[#d97757] animate-pulse" />
            <span>Powered by Claude Code</span>
          </div>
          <h2 className="text-3xl font-semibold tracking-tight">
            What shall we build?
          </h2>
          <p className="text-muted-foreground text-sm max-w-md text-center">
            I can read files, run commands, edit code, and ship changes — just tell me what you need.
          </p>
        </div>

        {/* Workspace chip */}
        {workspace && (
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/50 px-3 py-1.5 font-mono text-[11px] text-muted-foreground shadow-sm">
            <FolderIcon className="size-3.5 text-[#d97757]" strokeWidth={1.75} />
            <span className="text-foreground/80">{workspace.displayPath}</span>
            {workspace.branch && (
              <>
                <span className="text-border">│</span>
                <GitBranchIcon className="size-3 text-muted-foreground" strokeWidth={1.75} />
                <span>{workspace.branch}</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Suggestion cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
        {SUGGESTIONS.map(({ icon: Icon, title, prompt }) => (
          <button
            key={title}
            type="button"
            onClick={() => onSuggestion(prompt)}
            className="group relative flex items-start gap-3 overflow-hidden rounded-xl border border-border/60 bg-card/40 px-4 py-3.5 text-left transition-all hover:border-[#d97757]/40 hover:bg-card hover:shadow-sm"
          >
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/80 text-muted-foreground transition-colors group-hover:border-[#d97757]/40 group-hover:text-[#d97757]">
              <Icon className="size-3.5" strokeWidth={1.75} />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-sm font-medium text-foreground leading-tight">
                {title}
              </span>
              <span className="text-xs text-muted-foreground line-clamp-2 leading-snug">
                {prompt}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Keyboard hint */}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground/70">
        <span className="inline-flex items-center gap-1">
          <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border/80 bg-card px-1 font-mono text-[10px]">
            <CornerDownLeftIcon className="size-2.5" strokeWidth={2} />
          </kbd>
          <span>send</span>
        </span>
        <span className="text-border">·</span>
        <span className="inline-flex items-center gap-1">
          <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border/80 bg-card px-1 font-mono text-[10px]">
            <CommandIcon className="size-2.5" strokeWidth={2} />
          </kbd>
          <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border/80 bg-card px-1 font-mono text-[10px]">
            K
          </kbd>
          <span>new chat</span>
        </span>
      </div>
    </div>
  );
}

const MessageParts = memo(
  function MessageParts({
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
              <MemoToolDisplay key={`${message.id}-tool-${i}`} part={part} />
            );
          }

          return null;
        })}
      </>
    );
  },
);

export type ChatDebugInfo = {
  status: string;
  error: string | null;
  messageCount: number;
  selectedModel: string;
  models: string[];
  lastMessageRole?: string;
  sessionId: string | null;
};

export function ChatInner({
  sessionId,
  backend = "acp",
  onSessionReady,
  onPromptDone,
  onDebugInfo,
}: {
  sessionId: string | null;
  backend?: BackendType;
  onSessionReady?: (id: string) => void;
  onPromptDone?: () => void;
  onDebugInfo?: (info: ChatDebugInfo) => void;
}) {
  const [input, setInput] = useState("");
  const agent = useAgent(sessionId, backend);
  const handleSuggestion = (text: string) => setInput(text);
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

  // Debug info — intentionally omits the full messages array (it's heavy and
  // would cause DebugPanel to JSON.stringify it on every change).
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
    });
  }, [
    agent.status,
    agent.error,
    agent.selectedModel,
    agent.sessionId,
    agent.models,
    messageCount,
    lastMessageRole,
    onDebugInfo,
  ]);

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
              agent.messages[agent.messages.length - 1]?.role !== "assistant" && (
                <Spinner />
              )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      )}

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
