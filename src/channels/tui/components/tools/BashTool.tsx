import { Box, Text } from "ink";
import type { DynamicToolPart, TypedToolPart } from "../../types";
import { truncateText } from "../utils";

interface BashToolProps {
  toolPart: DynamicToolPart | TypedToolPart;
}

export function getInputSummary(input: any): string {
  return input?.command ? `$ ${input.command}` : "";
}

export function BashTool({ toolPart }: BashToolProps) {
  const input = toolPart.input as any;
  const output = toolPart.output as any;

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
