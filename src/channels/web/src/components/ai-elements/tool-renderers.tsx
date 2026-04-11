"use client";

import { cn } from "@/lib/utils";
import type { Part, ToolContentBlock, ToolKind } from "@/hooks/use-agent";
import {
  CodeBlockContainer,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockTitle,
  CodeBlockFilename,
  CodeBlockActions,
} from "./code-block";
import {
  FileIcon,
  FileEditIcon,
  SearchIcon,
  TerminalIcon,
  BrainIcon,
  GlobeIcon,
  TrashIcon,
  ArrowRightIcon,
  WrenchIcon,
} from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import type { BundledLanguage } from "shiki";

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
  if (lower === "dockerfile") return "dockerfile";
  if (lower === "makefile") return "makefile";

  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_LANG[ext] ?? ("text" as BundledLanguage);
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

// ── Content renderers ──────────────────────────────────────────────

function TextContent({ text, collapsible = true }: { text: string; collapsible?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const lines = text.split("\n");
  const isLong = collapsible && lines.length > MAX_LINES_COLLAPSED;
  const displayText = expanded || !isLong
    ? text
    : lines.slice(0, MAX_LINES_COLLAPSED).join("\n");

  return (
    <div className={cn(!expanded && isLong && "relative")}>
      <pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground font-mono p-3 overflow-auto">
        {displayText}
      </pre>
      {isLong && !expanded && (
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-center h-16 bg-gradient-to-t from-background to-transparent">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mb-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1 rounded-full bg-muted border"
          >
            Show all {lines.length} lines
          </button>
        </div>
      )}
    </div>
  );
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
            <span className="text-green-600 text-xs font-medium">new file</span>
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
  const diffLines: { type: "add" | "remove" | "context"; text: string }[] = [];

  // Simple LCS-based diff
  const lcs = buildLcs(oldLines, newLines);
  let oi = 0;
  let ni = 0;

  for (const line of lcs) {
    while (oi < oldLines.length && oldLines[oi] !== line) {
      diffLines.push({ type: "remove", text: oldLines[oi] });
      oi++;
    }
    while (ni < newLines.length && newLines[ni] !== line) {
      diffLines.push({ type: "add", text: newLines[ni] });
      ni++;
    }
    diffLines.push({ type: "context", text: line });
    oi++;
    ni++;
  }
  while (oi < oldLines.length) {
    diffLines.push({ type: "remove", text: oldLines[oi] });
    oi++;
  }
  while (ni < newLines.length) {
    diffLines.push({ type: "add", text: newLines[ni] });
    ni++;
  }

  return (
    <div className="rounded-md border overflow-hidden">
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
      <pre className="overflow-auto text-xs font-mono p-0 m-0">
        {diffLines.map((line, i) => (
          <div
            key={`${i}-${line.type}`}
            className={cn(
              "px-3 leading-relaxed",
              line.type === "add" && "bg-green-500/10 text-green-700 dark:text-green-400",
              line.type === "remove" && "bg-red-500/10 text-red-700 dark:text-red-400 line-through opacity-70",
              line.type === "context" && "text-muted-foreground",
            )}
          >
            <span className="select-none inline-block w-4 mr-2 text-muted-foreground/50">
              {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
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
    new Array(n + 1).fill(0),
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
    <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground font-mono">
      <TerminalIcon className="size-3" />
      <span>Terminal {terminalId}</span>
    </div>
  );
}

// ── Render content blocks ──────────────────────────────────────────

function ToolContentBlocks({ content }: { content: ToolContentBlock[] }) {
  if (content.length === 0) return null;

  return (
    <div className="space-y-2">
      {content.map((block, i) => {
        if (block.type === "content" && block.content.type === "text") {
          return <TextContent key={`content-${i}`} text={block.content.text} />;
        }
        if (block.type === "diff") {
          return (
            <DiffContent
              key={`diff-${i}`}
              path={block.path}
              oldText={block.oldText}
              newText={block.newText}
            />
          );
        }
        if (block.type === "terminal") {
          return (
            <TerminalContent
              key={`terminal-${i}`}
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
    (part.input.file_path as string) ??
    part.locations[0]?.path ??
    "";
  const textContent = extractText(part.content);
  const lang = filePath ? langFromPath(filePath) : ("text" as BundledLanguage);
  const isDone = part.state === "completed";

  if (!isDone || !textContent) {
    return (
      <ToolShell part={part}>
        {filePath && (
          <span className="font-mono text-xs text-muted-foreground">
            {filePath}
          </span>
        )}
      </ToolShell>
    );
  }

  const lines = textContent.split("\n");
  const isLong = lines.length > MAX_LINES_COLLAPSED;
  const displayCode = expanded || !isLong
    ? textContent
    : lines.slice(0, MAX_LINES_COLLAPSED).join("\n");

  return (
    <ToolShell part={part}>
      <CodeBlockContainer language={lang}>
        <CodeBlockHeader>
          <CodeBlockTitle>
            <CodeBlockFilename>{basename(filePath)}</CodeBlockFilename>
            <span className="text-muted-foreground/60">{lines.length} lines</span>
          </CodeBlockTitle>
          <CodeBlockActions>
            <CodeBlockCopyButton />
          </CodeBlockActions>
        </CodeBlockHeader>
        <div className={cn(!expanded && isLong && "relative")}>
          <CodeBlockContent
            code={displayCode}
            language={lang}
            showLineNumbers={false}
          />
          {isLong && !expanded && (
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-center h-16 bg-gradient-to-t from-background to-transparent">
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="mb-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1 rounded-full bg-muted border"
              >
                Show all {lines.length} lines
              </button>
            </div>
          )}
        </div>
      </CodeBlockContainer>
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
    (part.input.file_path as string) ??
    part.locations[0]?.path ??
    "";

  return (
    <ToolShell part={part}>
      {filePath && (
        <span className="font-mono text-xs text-muted-foreground">
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
        <div className="rounded-md border overflow-hidden">
          <div className="flex items-center gap-2 bg-muted/80 px-3 py-2 text-xs border-b">
            <TerminalIcon className="size-3 text-muted-foreground" />
            <code className="font-mono text-foreground">{command}</code>
          </div>
          {textContent && (
            <pre className="p-3 text-xs font-mono whitespace-pre-wrap break-words overflow-auto max-h-80 text-muted-foreground">
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
  const pattern = (part.input.pattern as string) ?? "";
  const textContent = extractText(part.content);

  return (
    <ToolShell part={part}>
      {pattern && (
        <div className="flex items-center gap-2 px-1 text-xs">
          <SearchIcon className="size-3 text-muted-foreground" />
          <code className="font-mono text-muted-foreground">{pattern}</code>
        </div>
      )}
      {textContent && (
        <pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground font-mono p-3 overflow-auto max-h-80 rounded-md border bg-muted/30">
          {textContent}
        </pre>
      )}
    </ToolShell>
  );
}

function ThinkToolDisplay({ part }: { part: ToolPart }) {
  const prompt = (part.input.prompt as string) ?? "";
  const description =
    (part.input.description as string) ?? part.title ?? "";

  return (
    <ToolShell part={part}>
      {description && (
        <p className="text-sm text-foreground">{description}</p>
      )}
      {prompt && (
        <pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground font-mono p-3 overflow-auto max-h-40 rounded-md border bg-muted/30">
          {prompt}
        </pre>
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
        "mb-3 w-full rounded-lg border bg-card text-card-foreground overflow-hidden",
        isRunning && "border-blue-500/30",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2 text-sm">
        {getKindIcon(part.kind)}
        <span className="font-medium truncate">{part.title || part.toolName}</span>
        <ToolStatusIndicator state={part.state} />
      </div>
      {children && (
        <div className="px-3 pb-3 space-y-2">{children}</div>
      )}
    </div>
  );
}

function ToolStatusIndicator({ state }: { state: ToolPart["state"] }) {
  if (state === "pending" || state === "in_progress") {
    return (
      <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="size-1.5 rounded-full bg-blue-500 animate-pulse" />
        {state === "pending" ? "Pending" : "Running"}
      </span>
    );
  }
  if (state === "completed") {
    return null; // Clean look when done
  }
  if (state === "failed") {
    return (
      <span className="ml-auto text-xs text-destructive font-medium">
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
        c.type === "content" && c.content.type === "text",
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
  other: FallbackToolDisplay,
};

export function ToolDisplay({ part }: { part: ToolPart }) {
  const Renderer = kindRenderers[part.kind] ?? FallbackToolDisplay;
  return <Renderer part={part} />;
}
