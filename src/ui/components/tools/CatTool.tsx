import { Box, Text } from "ink";
import type { DynamicToolPart, TypedToolPart } from "../../types";
import { truncateText } from "../utils";

interface CatToolProps {
  toolPart: DynamicToolPart | TypedToolPart;
}

export function getInputSummary(input: any): string {
  return input?.filePath || input?.file_path || "";
}

export function CatTool({ toolPart }: CatToolProps) {
  const input = toolPart.input as any;
  const output = toolPart.output;

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
