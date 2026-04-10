import { spawn, type ChildProcess } from "node:child_process";
import { Writable, Readable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";

export type SessionUpdate = acp.SessionNotification["update"];

export type ConfigOption = {
  id: string;
  name: string;
  type: string;
  currentValue: string;
  options?: Array<{ value: string; name: string; description?: string }>;
};

export type ACPSession = {
  sessionId: string;
  configOptions: ConfigOption[];
};

/**
 * Manages a single ACP agent process and its connection.
 * Supports creating new sessions and listing/loading existing ones.
 */
export class ACPClient {
  private process: ChildProcess | null = null;
  private connection: acp.ClientSideConnection | null = null;
  private onUpdate: ((sessionId: string, update: SessionUpdate) => void) | null = null;

  async connect(onUpdate: (sessionId: string, update: SessionUpdate) => void) {
    this.onUpdate = onUpdate;

    const agentProcess = spawn("node_modules/.bin/claude-agent-acp", [], {
      stdio: ["pipe", "pipe", "inherit"],
    });
    this.process = agentProcess;

    const input = Writable.toWeb(agentProcess.stdin!);
    const output = Readable.toWeb(
      agentProcess.stdout!,
    ) as ReadableStream<Uint8Array>;

    const stream = acp.ndJsonStream(input, output);

    const client: acp.Client = {
      requestPermission: async (params) => {
        const allowOption = params.options.find((o) => o.kind === "allow");
        return {
          outcome: {
            outcome: "selected",
            optionId: allowOption?.optionId ?? params.options[0].optionId,
          },
        };
      },

      sessionUpdate: async (params) => {
        this.onUpdate?.(params.sessionId, params.update);
      },

      readTextFile: async (params) => {
        try {
          const content = await Bun.file(params.uri.replace("file://", "")).text();
          return { content };
        } catch {
          throw acp.RequestError.resourceNotFound(params.uri);
        }
      },

      writeTextFile: async (params) => {
        await Bun.write(params.uri.replace("file://", ""), params.content);
        return {};
      },
    };

    this.connection = new acp.ClientSideConnection((_agent) => client, stream);

    await this.connection.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {
        fs: {
          readTextFile: true,
          writeTextFile: true,
        },
      },
      clientInfo: {
        name: "codia-web",
        title: "Codia Web",
        version: "0.1.0",
      },
    });
  }

  getConnection() {
    if (!this.connection) throw new Error("Not connected");
    return this.connection;
  }

  async newSession(cwd: string): Promise<ACPSession> {
    const conn = this.getConnection();
    const result = await conn.newSession({ cwd, mcpServers: [] });
    return {
      sessionId: result.sessionId,
      configOptions: (result.configOptions ?? []) as ConfigOption[],
    };
  }

  async listSessions(cwd?: string) {
    const conn = this.getConnection();
    const result = await conn.listSessions({ cwd });
    return result.sessions ?? [];
  }

  async loadSession(sessionId: string, cwd: string): Promise<ACPSession> {
    const conn = this.getConnection();
    const result = await conn.loadSession({ sessionId, cwd, mcpServers: [] });
    return {
      sessionId: result.sessionId,
      configOptions: (result.configOptions ?? []) as ConfigOption[],
    };
  }

  async prompt(sessionId: string, text: string) {
    const conn = this.getConnection();
    return conn.prompt({
      sessionId,
      prompt: [{ type: "text", text }],
    });
  }

  async setConfig(sessionId: string, configId: string, value: string) {
    const conn = this.getConnection();
    return conn.setSessionConfigOption({ sessionId, configId, value });
  }

  kill() {
    this.process?.kill();
  }
}
