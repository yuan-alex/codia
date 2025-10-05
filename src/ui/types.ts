import type { UIMessage } from "@ai-sdk/react";

export interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
}

export interface MainInterfaceProps {
  messages: UIMessage[];
  isProcessing: boolean;
  showInput: boolean;
  input: string;
  setInput: (value: string) => void;
  handleSubmit: (value: string) => void;
  isCliMode?: boolean;
  cliMessage?: string;
  error?: Error | null;
}

// Tool part type definitions based on AI SDK patterns
export type ToolState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error";

export interface BaseToolPart {
  toolCallId: string;
  state: ToolState;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  callProviderMetadata?: any;
  preliminary?: boolean;
}

export interface DynamicToolPart extends BaseToolPart {
  type: "dynamic-tool";
  toolName: string;
}

export interface TypedToolPart extends BaseToolPart {
  type: string; // e.g., 'tool-getWeather', 'tool-askForConfirmation'
}

export interface StepStartPart {
  type: "step-start";
}

export interface ReasoningPart {
  type: "reasoning";
  text: string;
}

export interface TextPart {
  type: "text";
  text: string;
  state?: "streaming" | "done";
}
