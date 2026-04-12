import { Box, Text } from "ink";
import type { DynamicToolPart, TypedToolPart } from "../../types";
import { truncateText } from "../utils";

interface EditToolProps {
  toolPart: DynamicToolPart | TypedToolPart;
}

export function getInputSummary(input: any): string {
  return input?.filePath || input?.file_path || "";
}

export function EditTool({ toolPart }: EditToolProps) {
  const input = toolPart.input as any;

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
