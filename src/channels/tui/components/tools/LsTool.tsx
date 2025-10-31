import { Box, Text } from "ink";
import type { DynamicToolPart, TypedToolPart } from "../../types";

interface LsToolProps {
  toolPart: DynamicToolPart | TypedToolPart;
}

export function getInputSummary(input: any): string {
  return input?.path || input?.directory || ".";
}

export function LsTool({ toolPart }: LsToolProps) {
  const input = toolPart.input as any;
  const output = toolPart.output as any;

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
