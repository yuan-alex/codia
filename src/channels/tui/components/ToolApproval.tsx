import { Box, Text } from "ink";
import { useState } from "react";
import type { DynamicToolPart, TypedToolPart } from "../types";
import { truncateText } from "./utils";

interface ToolApprovalProps {
  toolPart: DynamicToolPart | TypedToolPart;
  toolName: string;
  approvalId: string;
  onApprove: (approvalId: string, approved: boolean) => Promise<void>;
}

export function ToolApproval({
  toolPart,
  toolName,
  approvalId,
  onApprove,
}: ToolApprovalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [approved, setApproved] = useState<boolean | null>(null);

  const input = toolPart.input as any;

  const handleApprove = async (decision: boolean) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setApproved(decision);
    await onApprove(approvalId, decision);
    setIsSubmitting(false);
  };

  if (approved !== null) {
    return (
      <Box flexDirection="column" marginLeft={2} marginTop={1}>
        <Box
          borderStyle="round"
          borderColor={approved ? "green" : "red"}
          paddingX={1}
          paddingY={0}
        >
          <Text color={approved ? "green" : "red"} bold>
            {approved ? "Approved" : "Rejected"}
          </Text>
        </Box>
      </Box>
    );
  }

  // Render bash command approval
  if (toolName === "bash") {
    const command = input?.command || "unknown command";
    return (
      <Box flexDirection="column" marginLeft={2} marginTop={1}>
        <Box
          borderStyle="round"
          borderColor="yellow"
          paddingX={1}
          paddingY={0}
        >
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text color="yellow" bold>
                Command Execution Approval Required
              </Text>
            </Box>
            <Box
              borderStyle="single"
              borderColor="gray"
              paddingX={1}
              paddingY={0}
              marginBottom={1}
            >
              <Text color="cyan" bold>
                $ {command}
              </Text>
            </Box>
            <Box marginTop={1}>
              <Text color="yellow">
                Press <Text bold>Y</Text> to approve, <Text bold>N</Text> to reject
              </Text>
            </Box>
          </Box>
        </Box>
      </Box>
    );
  }

  // Render edit approval
  if (toolName === "edit") {
    const filePath = input?.filePath || input?.file_path || "unknown file";
    const oldString = input?.oldString || input?.old_string || "";
    const newString = input?.newString || input?.new_string || "";

    return (
      <Box flexDirection="column" marginLeft={2} marginTop={1}>
        <Box
          borderStyle="round"
          borderColor="yellow"
          paddingX={1}
          paddingY={0}
        >
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text color="yellow" bold>
                File Edit Approval Required
              </Text>
            </Box>
            <Box marginBottom={1}>
              <Text color="cyan" bold>
                {filePath}
              </Text>
            </Box>
            {(oldString || newString) && (
              <Box
                borderStyle="single"
                borderColor="gray"
                paddingX={1}
                paddingY={0}
                marginBottom={1}
              >
                <Box flexDirection="column">
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
              </Box>
            )}
            <Box marginTop={1}>
              <Text color="yellow">
                Press <Text bold>Y</Text> to approve, <Text bold>N</Text> to reject
              </Text>
            </Box>
          </Box>
        </Box>
      </Box>
    );
  }

  // Generic approval for other tools
  return (
    <Box flexDirection="column" marginLeft={2} marginTop={1}>
      <Box
        borderStyle="round"
        borderColor="yellow"
        paddingX={1}
        paddingY={0}
      >
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color="yellow" bold>
              Approval Required
            </Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="gray" dimColor>
              Tool: <Text color="cyan">{toolName}</Text>
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text color="yellow">
              Press <Text bold>Y</Text> to approve, <Text bold>N</Text> to reject
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

