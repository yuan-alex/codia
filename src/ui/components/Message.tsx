import { Box, Text } from "ink";
import { useState, useEffect } from "react";
import type { UIMessage } from "@ai-sdk/react";
import type { DynamicToolPart, TypedToolPart, ReasoningPart } from "../types";
import { ToolRenderer, getToolInputSummary } from "./ToolRenderer";
import { getStateDisplay } from "./utils";

// Component to handle reasoning display with timing
function ReasoningIndicator({ part }: { part: ReasoningPart }) {
  const [startTime] = useState(() => Date.now());
  const [isThinking, setIsThinking] = useState(true);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    // Check if reasoning has content (meaning it's complete)
    if (part.text && part.text.length > 0) {
      setIsThinking(false);
      setDuration(Math.round((Date.now() - startTime) / 1000));
    }
  }, [part.text, startTime]);

  if (isThinking) {
    return (
      <Text color="magenta" dimColor>
        💭 Thinking...
      </Text>
    );
  }

  return (
    <Text color="magenta" dimColor>
      💭 Thought for {duration}s
    </Text>
  );
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
      {toolPart.errorText ? (
        <Box flexDirection="column" marginLeft={2}>
          <Text color="red" dimColor>
            Error: {toolPart.errorText}
          </Text>
        </Box>
      ) : (
        <ToolRenderer toolPart={toolPart} toolName={toolPart.toolName} />
      )}
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
      {toolPart.errorText ? (
        <Box flexDirection="column" marginLeft={2}>
          <Text color="red" dimColor>
            Error: {toolPart.errorText}
          </Text>
        </Box>
      ) : (
        <ToolRenderer toolPart={toolPart} toolName={toolName} />
      )}
    </Box>
  );
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
            return (
              <ReasoningIndicator
                key={partIndex}
                part={part as ReasoningPart}
              />
            );
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
