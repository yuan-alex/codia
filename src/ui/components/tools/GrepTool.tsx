import { Box, Text } from "ink";
import type { DynamicToolPart, TypedToolPart } from "../../types";

interface GrepToolProps {
  toolPart: DynamicToolPart | TypedToolPart;
}

export function getInputSummary(input: any): string {
  const pattern = input?.pattern || "";
  const path = input?.path || "";
  return path ? `"${pattern}" in ${path}` : `"${pattern}"`;
}

export function GrepTool({ toolPart }: GrepToolProps) {
  const input = toolPart.input as any;
  const output = toolPart.output;

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
