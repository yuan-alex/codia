import { useChat } from "@ai-sdk/react";
import { useApp, useInput } from "ink";
import { useCallback, useEffect, useState } from "react";
import { DefaultChatTransport } from "ai";

import { MainInterface } from "./MainInterface";

// Parse command line arguments
const args = process.argv.slice(2);
const cliMessage = args.join(" ").trim();
const isCliMode = cliMessage.length > 0;

export function App() {
  const [input, setInput] = useState(cliMessage);
  const [showInput, setShowInput] = useState(!isCliMode);
  const { exit } = useApp();

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "http://localhost:3000/api/chat",
    }),
  });

  // Handle keyboard input (only in interactive mode)
  useInput(
    (input, key) => {
      if (key.escape) {
        exit();
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
    />
  );
}
