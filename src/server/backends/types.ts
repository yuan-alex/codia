import type { ServerWebSocket } from "bun";
import type { PermissionMode } from "./stream-json-backend";

export interface SessionResult {
  currentModelId: string | null;
  currentPermissionMode?: PermissionMode;
  models: { modelId: string; name: string; description?: string }[];
  sessionId: string;
}

export interface PermissionDenial {
  toolName: string;
  toolUseId: string;
}

export interface PromptResult {
  permissionDenials?: PermissionDenial[];
  stopReason: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface SessionListItem {
  cwd?: string;
  lastUpdated?: string;
  sessionId: string;
  title?: string;
}

export interface Backend {
  handleCancel(sessionId: string): void;

  handleLoadSession(
    ws: ServerWebSocket<unknown>,
    sessionId: string
  ): Promise<SessionResult>;
  handleNewSession(ws: ServerWebSocket<unknown>): Promise<SessionResult>;

  handlePrompt(
    ws: ServerWebSocket<unknown>,
    sessionId: string,
    text: string
  ): Promise<PromptResult>;

  handleSetEffort?(
    sessionId: string,
    effort: "off" | "low" | "medium" | "high" | "max"
  ): Promise<"off" | "low" | "medium" | "high" | "max">;

  handleSetModel?(sessionId: string, modelId: string): Promise<string>;

  handleSetPermissionMode?(
    sessionId: string,
    permissionMode: PermissionMode
  ): Promise<PermissionMode>;

  listSessions(): Promise<SessionListItem[]>;
}

/** Send a typed JSON message over a WebSocket. */
export function sendJson(
  ws: ServerWebSocket<unknown>,
  payload: Record<string, unknown>
) {
  ws.send(JSON.stringify(payload));
}

/** Send an update message over a WebSocket. */
export function sendUpdate(
  ws: ServerWebSocket<unknown>,
  update: Record<string, unknown>
) {
  ws.send(JSON.stringify({ type: "update", update }));
}
