"use client";

import {
  ArrowRightIcon,
  BotIcon,
  BrainIcon,
  FileEditIcon,
  FileIcon,
  GlobeIcon,
  SearchIcon,
  TerminalIcon,
  TrashIcon,
  WrenchIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import type { BundledLanguage } from "shiki";
import type { Part, ToolContentBlock, ToolKind } from "@/hooks/use-agent";
import { cn } from "@/lib/utils";
import {
  CodeBlockActions,
  CodeBlockContainer,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from "./code-block";

type ToolPart = Extract<Part, { type: "dynamic-tool" }>;

// ── Kind icons ─────────────────────────────────────────────────────

const kindIcons: Record<ToolKind, ReactNode> = {
  read: <FileIcon className="size-4 text-blue-500" />,
  edit: <FileEditIcon className="size-4 text-amber-500" />,
  delete: <TrashIcon className="size-4 text-red-500" />,
  move: <ArrowRightIcon className="size-4 text-purple-500" />,
  search: <SearchIcon className="size-4 text-cyan-500" />,
  execute: <TerminalIcon className="size-4 text-green-500" />,
  think: <BrainIcon className="size-4 text-violet-500" />,
  fetch: <GlobeIcon className="size-4 text-orange-500" />,
  agent: <BotIcon className="size-4 text-indigo-500" />,
  other: <WrenchIcon className="size-4 text-muted-foreground" />,
};

export function getKindIcon(kind: ToolKind): ReactNode {
  return kindIcons[kind] ?? kindIcons.other;
}

// ── Language detection ─────────────────────────────────────────────

const EXT_TO_LANG: Record<string, BundledLanguage> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  py: "python",
  rb: "ruby",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  css: "css",
  scss: "scss",
  html: "html",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  md: "markdown",
  sql: "sql",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "fish",
  dockerfile: "dockerfile",
  xml: "xml",
  svg: "xml",
  graphql: "graphql",
  prisma: "prisma",
};

function langFromPath(path: string): BundledLanguage {
  const filename = path.split("/").pop() ?? "";
  // Handle dotfiles like Dockerfile, Makefile
  const lower = filename.toLowerCase();
  if (lower === "dockerfile") {
    return "dockerfile";
  }
  if (lower === "makefile") {
    return "makefile";
  }

  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_LANG[ext] ?? ("text" as BundledLanguage);
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

// ── Content renderers ──────────────────────────────────────────────

function TextContent({
  text,
  collapsible = true,
}: {
  text: string;
  collapsible?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const lines = text.split("\n");
  const isLong = collapsible && lines.length > MAX_LINES_COLLAPSED;
  const displayText =
    expanded || !isLong ? text : lines.slice(0, MAX_LINES_COLLAPSED).join("\n");

  return (
    <div className={cn(!expanded && isLong && "relative")}>
      <pre className="overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-muted-foreground text-xs">
        {displayText}
      </pre>
      {isLong && !expanded && (
        <div className="absolute inset-x-0 bottom-0 flex h-16 items-end justify-center bg-gradient-to-t from-background to-transparent">
          <button
            className="mb-2 rounded-full border bg-muted px-3 py-1 font-medium text-muted-foreground text-xs transition-colors hover:text-foreground"
            onClick={() => setExpanded(true)}
            type="button"
          >
            Show all {lines.length} lines
          </button>
        </div>
      )}
    </div>
  );
}

function diffGutterChar(lineType: "add" | "remove" | "context"): string {
  if (lineType === "add") {
    return "+";
  }
  if (lineType === "remove") {
    return "-";
  }
  return " ";
}

function DiffContent({
  path,
  oldText,
  newText,
}: {
  path: string;
  oldText?: string;
  newText: string;
}) {
  const lang = langFromPath(path);

  if (!oldText) {
    // New file
    return (
      <CodeBlockContainer language={lang}>
        <CodeBlockHeader>
          <CodeBlockTitle>
            <CodeBlockFilename>{basename(path)}</CodeBlockFilename>
            <span className="font-medium text-green-600 text-xs">new file</span>
          </CodeBlockTitle>
          <CodeBlockActions>
            <CodeBlockCopyButton />
          </CodeBlockActions>
        </CodeBlockHeader>
        <CodeBlockContent code={newText} language={lang} />
      </CodeBlockContainer>
    );
  }

  // Compute simple line-level diff
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const diffLines: {
    id: number;
    type: "add" | "remove" | "context";
    text: string;
  }[] = [];
  let diffLineId = 0;
  const pushLine = (type: "add" | "remove" | "context", text: string) => {
    diffLines.push({ id: diffLineId++, text, type });
  };

  // Simple LCS-based diff
  const lcs = buildLcs(oldLines, newLines);
  let oi = 0;
  let ni = 0;

  for (const line of lcs) {
    while (oi < oldLines.length && oldLines[oi] !== line) {
      pushLine("remove", oldLines[oi]);
      oi++;
    }
    while (ni < newLines.length && newLines[ni] !== line) {
      pushLine("add", newLines[ni]);
      ni++;
    }
    pushLine("context", line);
    oi++;
    ni++;
  }
  while (oi < oldLines.length) {
    pushLine("remove", oldLines[oi]);
    oi++;
  }
  while (ni < newLines.length) {
    pushLine("add", newLines[ni]);
    ni++;
  }

  return (
    <div className="overflow-hidden rounded-md border">
      <div className="flex items-center justify-between border-b bg-muted/80 px-3 py-2 text-muted-foreground text-xs">
        <span className="font-mono">{basename(path)}</span>
        <span>
          <span className="text-green-600">
            +{diffLines.filter((d) => d.type === "add").length}
          </span>{" "}
          <span className="text-red-600">
            -{diffLines.filter((d) => d.type === "remove").length}
          </span>
        </span>
      </div>
      <pre className="m-0 overflow-auto p-0 font-mono text-xs">
        {diffLines.map((line) => (
          <div
            className={cn(
              "px-3 leading-relaxed",
              line.type === "add" &&
                "bg-green-500/10 text-green-700 dark:text-green-400",
              line.type === "remove" &&
                "bg-red-500/10 text-red-700 line-through opacity-70 dark:text-red-400",
              line.type === "context" && "text-muted-foreground"
            )}
            key={line.id}
          >
            <span className="mr-2 inline-block w-4 select-none text-muted-foreground/50">
              {diffGutterChar(line.type)}
            </span>
            {line.text}
          </div>
        ))}
      </pre>
    </div>
  );
}

// Simple LCS for diffing
function buildLcs(a: string[], b: string[]): string[] {
  // For large files, bail out to avoid O(n*m) memory
  if (a.length * b.length > 1_000_000) {
    return [];
  }
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0)
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const result: string[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return result;
}

function TerminalContent({ terminalId }: { terminalId: string }) {
  // TODO: integrate with terminal/create websocket stream
  return (
    <div className="flex items-center gap-2 p-3 font-mono text-muted-foreground text-xs">
      <TerminalIcon className="size-3" />
      <span>Terminal {terminalId}</span>
    </div>
  );
}

// ── Render content blocks ──────────────────────────────────────────

function ToolContentBlocks({ content }: { content: ToolContentBlock[] }) {
  if (content.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {content.map((block) => {
        if (block.type === "content" && block.content.type === "text") {
          return (
            <TextContent
              key={`content-${block.content.text}`}
              text={block.content.text}
            />
          );
        }
        if (block.type === "diff") {
          return (
            <DiffContent
              key={`diff-${block.path}-${block.oldText ?? ""}-${block.newText}`}
              newText={block.newText}
              oldText={block.oldText}
              path={block.path}
            />
          );
        }
        if (block.type === "terminal") {
          return (
            <TerminalContent
              key={`terminal-${block.terminalId}`}
              terminalId={block.terminalId}
            />
          );
        }
        return null;
      })}
    </div>
  );
}

// ── Kind-specific renderers ────────────────────────────────────────

const MAX_LINES_COLLAPSED = 20;

function ReadToolDisplay({ part }: { part: ToolPart }) {
  const [expanded, setExpanded] = useState(false);
  const filePath =
    (part.input.file_path as string) ?? part.locations[0]?.path ?? "";
  const textContent = extractText(part.content);
  const lang = filePath ? langFromPath(filePath) : ("text" as BundledLanguage);
  const isDone = part.state === "completed";

  return (
    <ToolShell part={part}>
      {filePath && (
        <button
          className={cn(
            "font-mono text-muted-foreground text-xs",
            isDone && textContent && "cursor-pointer hover:text-foreground"
          )}
          onClick={() => isDone && textContent && setExpanded((e) => !e)}
          type="button"
        >
          {filePath}
          {isDone && textContent && (
            <span className="ml-1.5 text-muted-foreground/50">
              {expanded ? "▾" : "▸"}
            </span>
          )}
        </button>
      )}
      {expanded && textContent && (
        <div className="[&_pre]:!text-[10px] [&_code]:!text-[10px]">
          <CodeBlockContainer language={lang}>
            <CodeBlockHeader>
              <CodeBlockTitle>
                <CodeBlockFilename>{basename(filePath)}</CodeBlockFilename>
                <span className="text-muted-foreground/60">
                  {textContent.split("\n").length} lines
                </span>
              </CodeBlockTitle>
              <CodeBlockActions>
                <CodeBlockCopyButton />
              </CodeBlockActions>
            </CodeBlockHeader>
            <CodeBlockContent
              code={textContent}
              language={lang}
              showLineNumbers={false}
            />
          </CodeBlockContainer>
        </div>
      )}
    </ToolShell>
  );
}

function EditToolDisplay({ part }: { part: ToolPart }) {
  const diffBlocks = part.content.filter((c) => c.type === "diff");

  if (diffBlocks.length > 0) {
    return (
      <ToolShell part={part}>
        <ToolContentBlocks content={part.content} />
      </ToolShell>
    );
  }

  // Fallback: show text content if no diffs
  const textContent = extractText(part.content);
  const filePath =
    (part.input.file_path as string) ?? part.locations[0]?.path ?? "";

  return (
    <ToolShell part={part}>
      {filePath && (
        <span className="font-mono text-muted-foreground text-xs">
          {filePath}
        </span>
      )}
      {textContent && <TextContent text={textContent} />}
    </ToolShell>
  );
}

function ExecuteToolDisplay({ part }: { part: ToolPart }) {
  const command = (part.input.command as string) ?? "";
  const textContent = extractText(part.content);
  const hasTerminal = part.content.some((c) => c.type === "terminal");

  return (
    <ToolShell part={part}>
      {command && (
        <div className="overflow-hidden rounded-md border">
          <div className="flex items-center gap-2 border-b bg-muted/80 px-3 py-2 text-xs">
            <TerminalIcon className="size-3 text-muted-foreground" />
            <code className="font-mono text-foreground">{command}</code>
          </div>
          {textContent && (
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-muted-foreground text-xs">
              {textContent}
            </pre>
          )}
        </div>
      )}
      {!command && <ToolContentBlocks content={part.content} />}
      {hasTerminal && (
        <ToolContentBlocks
          content={part.content.filter((c) => c.type === "terminal")}
        />
      )}
    </ToolShell>
  );
}

function SearchToolDisplay({ part }: { part: ToolPart }) {
  const [expanded, setExpanded] = useState(false);
  const pattern = (part.input.pattern as string) ?? "";
  const textContent = extractText(part.content);
  const isDone = part.state === "completed";

  return (
    <ToolShell part={part}>
      {pattern && (
        <button
          className={cn(
            "flex items-center gap-2 px-1 text-xs",
            isDone && textContent && "cursor-pointer hover:text-foreground"
          )}
          onClick={() => isDone && textContent && setExpanded((e) => !e)}
          type="button"
        >
          <SearchIcon className="size-3 text-muted-foreground" />
          <code className="font-mono text-muted-foreground">{pattern}</code>
          {isDone && textContent && (
            <span className="text-muted-foreground/50">
              {expanded ? "▾" : "▸"}
            </span>
          )}
        </button>
      )}
      {expanded && textContent && (
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 font-mono text-muted-foreground text-xs">
          {textContent}
        </pre>
      )}
    </ToolShell>
  );
}

function ThinkToolDisplay({ part }: { part: ToolPart }) {
  const prompt = (part.input.prompt as string) ?? "";
  const description = (part.input.description as string) ?? part.title ?? "";

  return (
    <ToolShell part={part}>
      {description && <p className="text-foreground text-sm">{description}</p>}
      {prompt && (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 font-mono text-muted-foreground text-xs">
          {prompt}
        </pre>
      )}
    </ToolShell>
  );
}

function AgentToolDisplay({ part }: { part: ToolPart }) {
  const [expanded, setExpanded] = useState(false);
  const description = (part.input.description as string) ?? "";
  const prompt = (part.input.prompt as string) ?? "";
  const subagentType = (part.input.subagent_type as string) ?? "";
  const textContent = extractText(part.content);
  const isDone = part.state === "completed";
  const isFailed = part.state === "failed";

  return (
    <ToolShell part={part}>
      {description && <p className="text-foreground text-sm">{description}</p>}
      {subagentType && (
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-indigo-500/10 px-2 py-0.5 font-medium text-[10px] text-indigo-500">
          {subagentType}
        </span>
      )}
      {prompt && (
        <button
          className="w-full text-left"
          onClick={() => setExpanded((e) => !e)}
          type="button"
        >
          <pre
            className={cn(
              "overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 font-mono text-muted-foreground text-xs",
              !expanded && "max-h-16"
            )}
          >
            {prompt}
          </pre>
          {!expanded && prompt.split("\n").length > 3 && (
            <span className="mt-1 block text-muted-foreground/60 text-xs">
              Click to expand prompt
            </span>
          )}
        </button>
      )}
      {(isDone || isFailed) && textContent && (
        <div
          className={cn(
            "overflow-hidden rounded-md border",
            isFailed && "border-destructive/30"
          )}
        >
          <div
            className={cn(
              "border-b px-3 py-1.5 font-medium text-xs",
              isFailed
                ? "bg-destructive/10 text-destructive"
                : "bg-muted/80 text-muted-foreground"
            )}
          >
            {isFailed ? "Error" : "Result"}
          </div>
          <TextContent text={textContent} />
        </div>
      )}
    </ToolShell>
  );
}

function FallbackToolDisplay({ part }: { part: ToolPart }) {
  const textContent = extractText(part.content);

  return (
    <ToolShell part={part}>
      <ToolContentBlocks content={part.content} />
      {!part.content.length && textContent && (
        <TextContent text={textContent} />
      )}
    </ToolShell>
  );
}

// ── Shared shell ───────────────────────────────────────────────────

function ToolShell({
  part,
  children,
}: {
  part: ToolPart;
  children?: ReactNode;
}) {
  const isRunning = part.state === "pending" || part.state === "in_progress";

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-lg border bg-card text-card-foreground",
        isRunning && "border-blue-500/30"
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2 text-sm">
        {getKindIcon(part.kind)}
        <span className="truncate font-medium">
          {part.title || part.toolName}
        </span>
        <ToolStatusIndicator state={part.state} />
      </div>
      {children && <div className="space-y-2 px-3 pb-3">{children}</div>}
    </div>
  );
}

function ToolStatusIndicator({ state }: { state: ToolPart["state"] }) {
  if (state === "pending" || state === "in_progress") {
    return (
      <span className="ml-auto flex items-center gap-1.5 text-muted-foreground text-xs">
        <span className="size-1.5 animate-pulse rounded-full bg-blue-500" />
        {state === "pending" ? "Pending" : "Running"}
      </span>
    );
  }
  if (state === "completed") {
    return null; // Clean look when done
  }
  if (state === "failed") {
    return (
      <span className="ml-auto font-medium text-destructive text-xs">
        Failed
      </span>
    );
  }
  return null;
}

// ── Helpers ────────────────────────────────────────────────────────

function extractText(content: ToolContentBlock[]): string {
  return content
    .filter(
      (c): c is Extract<ToolContentBlock, { type: "content" }> =>
        c.type === "content" && c.content.type === "text"
    )
    .map((c) => c.content.text)
    .join("\n");
}

// ── Main dispatcher ────────────────────────────────────────────────

const kindRenderers: Record<
  ToolKind,
  (props: { part: ToolPart }) => ReactNode
> = {
  read: ReadToolDisplay,
  edit: EditToolDisplay,
  delete: FallbackToolDisplay,
  move: FallbackToolDisplay,
  search: SearchToolDisplay,
  execute: ExecuteToolDisplay,
  think: ThinkToolDisplay,
  fetch: FallbackToolDisplay,
  agent: AgentToolDisplay,
  other: FallbackToolDisplay,
};

export function ToolDisplay({ part }: { part: ToolPart }) {
  const Renderer = kindRenderers[part.kind] ?? FallbackToolDisplay;
  return <Renderer part={part} />;
}
