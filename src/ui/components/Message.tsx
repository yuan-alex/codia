import { Box, Text } from "ink";
import React from "react";
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

// Helper function to truncate long JSON output for better readability
function truncateOutput(
  text: string,
  maxLines = 10,
): { text: string; truncated: boolean } {
  const lines = text.split("\n");
  if (lines.length <= maxLines) {
    return { text, truncated: false };
  }
  return {
    text: lines.slice(0, maxLines).join("\n") + "\n...",
    truncated: true,
  };
}

// Helper function to render tool input preview
function renderToolInputPreview(input: unknown) {
  if (input === undefined) return null;

  const formatted = formatToolData(input);
  return (
    <Box marginTop={1} borderColor="cyan" borderLeft paddingLeft={2}>
      <Text color="gray" dimColor>
        Preview:
      </Text>
      <Box marginTop={1}>
        <Text color="cyan">{formatted}</Text>
      </Box>
    </Box>
  );
}

// Helper function to render dynamic tool parts
function renderDynamicToolPart(toolPart: DynamicToolPart, index: number) {
  const callId = toolPart.toolCallId;

  return (
    <Box key={`tool-${index}-${callId}`} paddingLeft={2}>
      <Text color="yellow">{toolPart.toolName} </Text>
      {renderToolState(toolPart, callId)}
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

  // Check if this is an interactive tool that needs user confirmation
  const isInteractiveTool =
    toolName.includes("askForConfirmation") ||
    toolName.includes("confirm") ||
    toolName.includes("approval");

  return (
    <Box key={`tool-${index}-${callId}`} paddingLeft={2}>
      <Text color="yellow">{toolName} </Text>
      {isInteractiveTool && (
        <Text color="magenta" dimColor>
          (Interactive){" "}
        </Text>
      )}
      {renderToolState(toolPart, callId, isInteractiveTool)}
    </Box>
  );
}

// Helper function to render tool state
function renderToolState(
  toolPart: DynamicToolPart | TypedToolPart,
  _callId: string,
  isInteractive = false,
) {
  switch (toolPart.state) {
    case "input-streaming":
      return (
        <Box flexDirection="column">
          <Text color="gray" dimColor>
            Streaming input...
          </Text>
          {renderToolInputPreview(toolPart.input)}
        </Box>
      );

    case "input-available":
      return (
        <Box flexDirection="column">
          {isInteractive ? (
            <>
              <Text color="magenta">Awaiting user interaction...</Text>
              {toolPart.input &&
                typeof toolPart.input === "object" &&
                toolPart.input !== null &&
                "message" in toolPart.input && (
                  <Box
                    marginTop={1}
                    paddingLeft={2}
                    borderLeft
                    borderColor="magenta"
                  >
                    <Text color="white">
                      {String((toolPart.input as any).message)}
                    </Text>
                    <Box marginTop={1}>
                      <Text color="gray" dimColor>
                        This tool requires user confirmation (not available in
                        CLI mode)
                      </Text>
                    </Box>
                  </Box>
                )}
            </>
          ) : (
            <>
              <Text color="yellow">Executing...</Text>
              {renderToolInputPreview(toolPart.input)}
            </>
          )}
        </Box>
      );

    case "output-available":
      return null;

    case "output-error":
      return (
        <Box flexDirection="column">
          <Text color="red">Error</Text>
          {renderToolInputPreview(toolPart.input)}
          {toolPart.errorText && (
            <Box marginTop={1}>
              <Text color="gray" dimColor>
                Details:
              </Text>
              <Box paddingLeft={2}>
                <Text color="red">{toolPart.errorText}</Text>
              </Box>
            </Box>
          )}
        </Box>
      );

    default:
      // Fallback for unknown states or legacy format
      return (
        <Box flexDirection="column">
          {toolPart.state && (
            <Box marginBottom={1}>
              <Text color="gray" dimColor>
                Status:{" "}
              </Text>
              <Text color="gray">
                {String(toolPart.state).replace("-", " ")}
              </Text>
            </Box>
          )}
          {renderToolInputPreview(toolPart.input)}
          {toolPart.output !== undefined && (
            <Box marginBottom={1}>
              <Text color="gray" dimColor>
                Output:
              </Text>
              <Box paddingLeft={2}>
                <Text color="green">
                  {(() => {
                    const formatted = formatToolData(toolPart.output);
                    const { text, truncated } = truncateOutput(formatted);
                    return (
                      <>
                        <Text>{text}</Text>
                        {truncated && (
                          <Text color="gray" dimColor>
                            {"\n"}(Output truncated...)
                          </Text>
                        )}
                      </>
                    );
                  })()}
                </Text>
              </Box>
            </Box>
          )}
          {toolPart.errorText && (
            <Box marginBottom={1}>
              <Text color="gray" dimColor>
                Error:
              </Text>
              <Box paddingLeft={2}>
                <Text color="red">{toolPart.errorText}</Text>
              </Box>
            </Box>
          )}
        </Box>
      );
  }
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
      <Box>
        <Text color="cyan" bold>
          →
        </Text>
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
