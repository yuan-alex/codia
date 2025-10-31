import { useChat } from "@ai-sdk/react";
import { useApp, useInput } from "ink";
import { useCallback, useEffect, useState } from "react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";

import { MainInterface } from "./MainInterface";
import { config } from "../../lib/config";

// Parse command line arguments
const args = process.argv.slice(2);
const cliMessage = args.join(" ").trim();
const isCliMode = cliMessage.length > 0;

export function App() {
  const [input, setInput] = useState(cliMessage);
  const [showInput, setShowInput] = useState(!isCliMode);
  const { exit } = useApp();

  const { messages, sendMessage, status, error, addToolApprovalResponse } =
    useChat({
      transport: new DefaultChatTransport({
        api: `http://localhost:${config.port}/api/chat`,
      }),
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    });

  // Handle approval submission
  const handleApprove = useCallback(
    async (approvalId: string, approved: boolean) => {
      addToolApprovalResponse({
        id: approvalId,
        approved,
      });
    },
    [addToolApprovalResponse],
  );

  // Find the first pending approval ID
  const getPendingApprovalId = useCallback(() => {
    for (const message of messages) {
      if (message.role === "assistant") {
        for (const part of message.parts || []) {
          const toolPart = part as any;
          if (
            toolPart.state === "approval-requested" &&
            toolPart.approval?.id
          ) {
            return toolPart.approval.id;
          }
        }
      }
    }
    return null;
  }, [messages]);

  // Handle keyboard input (only in interactive mode)
  useInput(
    (input, key) => {
      if (key.escape) {
        exit();
        return;
      }

      // Handle approval keys (Y/N) when there are pending approvals
      const pendingApprovalId = getPendingApprovalId();
      if (pendingApprovalId) {
        const lowerInput = input.toLowerCase();
        if (lowerInput === "y" || lowerInput === "yes") {
          handleApprove(pendingApprovalId, true);
          return;
        }
        if (lowerInput === "n" || lowerInput === "no") {
          handleApprove(pendingApprovalId, false);
          return;
        }
      }
    },
    { isActive: !isCliMode },
  );

  // Handle user input submission
  const handleSubmit = useCallback(
    async (value: string) => {
      const trimmedInput = value.trim();
      const trimmedLowerInput = trimmedInput.toLowerCase();

      // Handle exit commands
      if (
        trimmedLowerInput === "exit" ||
        trimmedLowerInput === "quit" ||
        trimmedLowerInput === "q"
      ) {
        setTimeout(() => exit(), 500);
        return;
      }

      // Handle empty input
      if (!trimmedInput) {
        return;
      }

      setShowInput(false);
      setInput("");

      // Send message to API
      await sendMessage({ text: trimmedInput });

      setShowInput(!isCliMode);

      // Auto-exit in CLI mode after processing
      if (isCliMode) {
        setTimeout(() => {
          console.log("\n=== CLI Execution Complete ===");
          exit();
        }, 1000);
      }
    },
    [exit, sendMessage, isCliMode],
  );

  // Auto-submit CLI message if provided
  useEffect(() => {
    if (isCliMode && cliMessage && messages.length === 0) {
      handleSubmit(cliMessage);
    }
  }, [isCliMode, cliMessage, messages.length, handleSubmit]);

  // Main layout
  return (
    <MainInterface
      messages={messages}
      isProcessing={status === "streaming"}
      showInput={showInput}
      input={input}
      setInput={setInput}
      handleSubmit={handleSubmit}
      isCliMode={isCliMode}
      cliMessage={cliMessage}
      error={error}
      onApprove={handleApprove}
    />
  );
}
