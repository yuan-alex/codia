import { Box, Text } from "ink";
import type { DynamicToolPart, TypedToolPart } from "../../types";
import { formatToolData, truncateText } from "../utils";

interface GenericToolProps {
  toolPart: DynamicToolPart | TypedToolPart;
}

export function getInputSummary(input: any): string {
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

export function GenericTool({ toolPart }: GenericToolProps) {
  const formatted = formatToolData(toolPart.output || toolPart.input);
  const { text } = truncateText(formatted);

  return (
    <Box flexDirection="column" marginLeft={2}>
      <Text color="gray" dimColor>
        {text}
      </Text>
    </Box>
  );
}
