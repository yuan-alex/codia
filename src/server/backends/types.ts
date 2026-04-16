import type { ServerWebSocket } from "bun";
import type { PermissionMode } from "./stream-json-backend";

export type SessionResult = {
  sessionId: string;
  models: { modelId: string; name: string; description?: string }[];
  currentModelId: string | null;
  currentPermissionMode?: PermissionMode;
};

export type PermissionDenial = {
  toolName: string;
  toolUseId: string;
};

export type PromptResult = {
  stopReason: string;
  usage?: { inputTokens: number; outputTokens: number };
  permissionDenials?: PermissionDenial[];
};

export type SessionListItem = {
  sessionId: string;
  cwd?: string;
  title?: string;
  lastUpdated?: string;
};

export interface Backend {
  handleNewSession(ws: ServerWebSocket<any>): Promise<SessionResult>;

  handleLoadSession(
    ws: ServerWebSocket<any>,
    sessionId: string,
  ): Promise<SessionResult>;

  handlePrompt(
    ws: ServerWebSocket<any>,
    sessionId: string,
    text: string,
  ): Promise<PromptResult>;

  handleCancel(sessionId: string): void;

  handleSetModel?(
    sessionId: string,
    modelId: string,
  ): Promise<string>;

  handleSetEffort?(
    sessionId: string,
    effort: "off" | "low" | "medium" | "high" | "max",
  ): Promise<"off" | "low" | "medium" | "high" | "max">;

  handleSetPermissionMode?(
    sessionId: string,
    permissionMode: PermissionMode,
  ): Promise<PermissionMode>;

  listSessions(): Promise<SessionListItem[]>;
}

/** Send a typed JSON message over a WebSocket. */
export function sendJson(ws: ServerWebSocket<any>, payload: Record<string, unknown>) {
  ws.send(JSON.stringify(payload));
}

/** Send an update message over a WebSocket. */
export function sendUpdate(ws: ServerWebSocket<any>, update: Record<string, unknown>) {
  ws.send(JSON.stringify({ type: "update", update }));
}
