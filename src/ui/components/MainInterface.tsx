import { Box, Text } from "ink";
import type { MainInterfaceProps } from "../types";
import { TextInput } from "./TextInput";
import { Message } from "./Message";

export function MainInterface({
  messages,
  isProcessing,
  showInput,
  input,
  setInput,
  handleSubmit,
  isCliMode: cliMode,
  cliMessage: cliMsg,
  error,
}: MainInterfaceProps) {
  const isCliMode = cliMode ?? false;
  const cliMessage = cliMsg ?? "";

  return (
    <Box flexDirection="column" height="100%" flexGrow={1}>
      {/* Messages Display */}
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        {messages.map((message, index) => (
          <Box key={index} marginBottom={1}>
            <Message message={message} />
          </Box>
        ))}

        {/* Error Display */}
        {error && (
          <Box marginBottom={1}>
            <Text color="red">Error: {error.message}</Text>
          </Box>
        )}
      </Box>

      {/* Intro Blurb - only show when no messages yet */}
      {messages.length === 0 && (
        <Box paddingX={2} paddingY={1} borderTop>
          <Box flexDirection="column">
            <Text color="cyanBright" bold>
              Hey, I'm Codia
            </Text>
            <Text color="gray" dimColor>
              Ask me to code, debug, or help with any programming tasks.
            </Text>
          </Box>
        </Box>
      )}

      {/* Input Area - Only show in interactive mode */}
      {!isCliMode && (
        <>
          <Box borderStyle="round" borderColor="gray" paddingX={2} paddingY={0}>
            {showInput && (
              <Box>
                <Text color="cyan">→ </Text>
                <TextInput
                  value={input}
                  onChange={setInput}
                  onSubmit={handleSubmit}
                  placeholder="Chat with Codia or 'exit' to quit..."
                />
              </Box>
            )}
          </Box>

          {/* Footer */}
          <Box paddingX={2} paddingY={1} borderTop>
            <Text color="gray" dimColor>
              Press ESC to exit • Type 'exit' to quit
            </Text>
          </Box>
        </>
      )}

      {/* CLI Mode Footer */}
      {isCliMode && (
        <Box paddingX={2} paddingY={1} borderTop>
          <Text color="yellow" bold>
            CLI Mode: Processing "{cliMessage}"...
          </Text>
        </Box>
      )}
    </Box>
  );
}
