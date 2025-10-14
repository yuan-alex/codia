import { Box, Text } from "ink";
import type { UIMessage } from "@ai-sdk/react";
import type { DynamicToolPart, TypedToolPart } from "../types";

// Helper function to format tool input/output for display
function formatToolData(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }
  if (data === null || data === undefined) {
    return String(data);
  }
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

// Helper function to truncate text by character count for standardization
function truncateText(
  text: string,
  maxLength = 300,
): { text: string; truncated: boolean } {
  if (text.length <= maxLength) {
    return { text, truncated: false };
  }
  return {
    text: text.slice(0, maxLength) + "...",
    truncated: true,
  };
}

// Helper function to get a short display string for tool state
function getStateDisplay(state: string | undefined): string {
  if (!state) return "";
  switch (state) {
    case "input-streaming":
      return "streaming...";
    case "input-available":
      return "running...";
    case "output-available":
      return "✅";
    default:
      return state.replace("-", " ");
  }
}

// Helper function to get a one-line summary of tool input
function getToolInputSummary(toolName: string, input: any): string {
  if (!input) return "";

  switch (toolName) {
    case "bashTool":
      return input?.command ? `$ ${input.command}` : "";
    case "catTool":
      return input?.filePath || input?.file_path || "";
    case "editTool":
      return input?.filePath || input?.file_path || "";
    case "grepTool":
      const pattern = input?.pattern || "";
      const path = input?.path || "";
      return path ? `"${pattern}" in ${path}` : `"${pattern}"`;
    case "lsTool":
      return input?.path || input?.directory || ".";
    default:
      // For unknown tools, try to extract meaningful info
      if (typeof input === "string") {
        return truncateText(input).text;
      }
      if (input?.path || input?.filePath || input?.file_path) {
        return input.path || input.filePath || input.file_path;
      }
      if (input?.command) {
        return truncateText(input.command).text;
      }
      return "";
  }
}

// Tool-specific rendering functions
function renderBashTool(input: any, output: any) {
  const cmd = input?.command || "unknown command";
  const exitCode = output?.exitCode;
  const stdout = output?.stdout || "";
  const stderr = output?.stderr || "";

  return (
    <Box flexDirection="column" marginLeft={2}>
      <Text color="gray" dimColor>
        $ {cmd}
      </Text>
      {stderr && (
        <Text color="red" dimColor>
          {truncateText(stderr).text}
        </Text>
      )}
      {exitCode === 0 && stdout && (
        <Text color="gray" dimColor>
          {truncateText(stdout).text}
        </Text>
      )}
    </Box>
  );
}

function renderCatTool(input: any, output: any) {
  const filePath = input?.filePath || "unknown file";
  const content = typeof output === "string" ? output : JSON.stringify(output);
  const { text } = truncateText(content);

  return (
    <Box flexDirection="column" marginLeft={2}>
      <Text color="gray" dimColor>
        📄 {filePath}
      </Text>
      <Text color="gray" dimColor>
        {text}
      </Text>
    </Box>
  );
}

function renderEditTool(input: any, _output: any) {
  const filePath = input?.filePath || input?.file_path || "unknown file";
  const oldString = input?.oldString || input?.old_string || "";
  const newString = input?.newString || input?.new_string || "";

  return (
    <Box flexDirection="column" marginLeft={2}>
      <Text color="gray" dimColor>
        ✏️ {filePath}
      </Text>
      {oldString && (
        <Text color="red" dimColor>
          - {truncateText(oldString).text}
        </Text>
      )}
      {newString && (
        <Text color="green" dimColor>
          + {truncateText(newString).text}
        </Text>
      )}
    </Box>
  );
}

function renderGrepTool(input: any, output: any) {
  const pattern = input?.pattern || "unknown pattern";
  const matches = Array.isArray(output)
    ? output.length
    : typeof output === "string"
      ? output.split("\n").length
      : 0;

  return (
    <Box flexDirection="column" marginLeft={2}>
      <Text color="gray" dimColor>
        🔍 "{pattern}" → {matches} matches
      </Text>
    </Box>
  );
}

function renderLsTool(input: any, output: any) {
  const path = input?.path || input?.directory || ".";
  const items = Array.isArray(output) ? output : output?.files || [];
  const count = Array.isArray(items) ? items.length : 0;

  return (
    <Box flexDirection="column" marginLeft={2}>
      <Text color="gray" dimColor>
        📂 {path} ({count} items)
      </Text>
    </Box>
  );
}

// Generic fallback renderer
function renderGenericTool(input: any, output: any) {
  const formatted = formatToolData(output || input);
  const { text } = truncateText(formatted);

  return (
    <Box flexDirection="column" marginLeft={2}>
      <Text color="gray" dimColor>
        {text}
      </Text>
    </Box>
  );
}

// Helper function to get tool-specific renderer
function getToolRenderer(toolName: string) {
  // Match exact tool names from src/lib/tools
  switch (toolName) {
    case "bashTool":
      return renderBashTool;
    case "catTool":
      return renderCatTool;
    case "editTool":
      return renderEditTool;
    case "grepTool":
      return renderGrepTool;
    case "lsTool":
      return renderLsTool;
    default:
      return renderGenericTool;
  }
}

// Helper function to render dynamic tool parts
function renderDynamicToolPart(toolPart: DynamicToolPart, index: number) {
  const callId = toolPart.toolCallId;
  const inputSummary = getToolInputSummary(toolPart.toolName, toolPart.input);

  return (
    <Box key={`tool-${index}-${callId}`} flexDirection="column">
      <Box>
        <Text color="yellow">{toolPart.toolName} </Text>
        {inputSummary && (
          <Text color="cyan" dimColor>
            {inputSummary}{" "}
          </Text>
        )}
        <Text color="gray" dimColor>
          {getStateDisplay(toolPart.state)}
        </Text>
      </Box>
      {renderToolState(toolPart, callId, toolPart.toolName)}
    </Box>
  );
}

// Helper function to render typed tool parts
function renderTypedToolPart(
  toolPart: TypedToolPart,
  toolName: string,
  index: number,
) {
  const callId = toolPart.toolCallId;
  const inputSummary = getToolInputSummary(toolName, toolPart.input);

  // Check if this is an interactive tool that needs user confirmation
  const isInteractiveTool =
    toolName.includes("askForConfirmation") ||
    toolName.includes("confirm") ||
    toolName.includes("approval");

  return (
    <Box key={`tool-${index}-${callId}`} flexDirection="column">
      <Box>
        <Text color="yellow">{toolName} </Text>
        {inputSummary && (
          <Text color="cyan" dimColor>
            {inputSummary}{" "}
          </Text>
        )}
        {isInteractiveTool && (
          <Text color="magenta" dimColor>
            (Interactive){" "}
          </Text>
        )}
        <Text color="gray" dimColor>
          {getStateDisplay(toolPart.state)}
        </Text>
      </Box>
      {renderToolState(toolPart, callId, toolName)}
    </Box>
  );
}

// Helper function to render tool state
function renderToolState(
  toolPart: DynamicToolPart | TypedToolPart,
  _callId: string,
  toolName: string,
) {
  // Always show errors
  if (toolPart.errorText) {
    return (
      <Box flexDirection="column" marginLeft={2}>
        <Text color="red" dimColor>
          Error: {toolPart.errorText}
        </Text>
      </Box>
    );
  }

  // For output-available state, use tool-specific renderer
  if (toolPart.state === "output-available" && toolPart.output !== undefined) {
    const renderer = getToolRenderer(toolName);
    return renderer(toolPart.input, toolPart.output);
  }

  return null;
}

interface MessageProps {
  message: UIMessage;
}

export function Message({ message }: MessageProps) {
  if (message.role === "user") {
    const text =
      message.parts
        ?.filter((part) => part.type === "text")
        .map((part) => (part as any).text)
        .join("") || "";
    return (
      <Box
        borderStyle="round"
        borderColor="gray"
        paddingX={2}
        paddingY={0}
        width="100%"
      >
        <Text>{text}</Text>
      </Box>
    );
  }

  if (message.role === "assistant") {
    return (
      <Box flexDirection="column">
        {message.parts?.map((part, partIndex) => {
          if (part.type === "reasoning") {
            return null;
          }
          if (part.type === "text") {
            return <Text key={partIndex}>{(part as any).text}</Text>;
          }
          if (part.type === "dynamic-tool") {
            return renderDynamicToolPart(part as DynamicToolPart, partIndex);
          }
          if (part.type.startsWith("tool-")) {
            const toolName = part.type.replace("tool-", "");
            return renderTypedToolPart(
              part as TypedToolPart,
              toolName,
              partIndex,
            );
          }
          return null;
        })}
      </Box>
    );
  }

  return null;
}
