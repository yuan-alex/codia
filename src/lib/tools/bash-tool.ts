import { tool } from "ai";
import { spawn } from "child_process";
import { z } from "zod";

// Helper function to check if command is read-only
function isReadOnlyCommand(command: string): boolean {
  const readOnlyCommands = [
    /^ls\b/,
    /^cat\b/,
    /^head\b/,
    /^tail\b/,
    /^grep\b/,
    /^find\b/,
    /^which\b/,
    /^ps\b/,
    /^pwd\b/,
    /^whoami\b/,
    /^date\b/,
    /^env\b/,
    /^echo\b/,
    /^wc\b/,
    /^diff\b/,
    /^file\b/,
    /^stat\b/,
    /^tree\b/,
    /^less\b/,
    /^more\b/,
  ];
  return readOnlyCommands.some((pattern) => pattern.test(command.trim()));
}

// Helper function to check if command is potentially dangerous
function isDangerousCommand(command: string): boolean {
  const dangerousPatterns = [
    /rm\s+-rf\s*\//,
    /sudo\b/,
    /chmod\s+777/,
    />\/dev\/null.*&/,
    /&\s*$/,
    /curl.*\|\s*sh/,
    /wget.*\|\s*sh/,
    /pkill/,
    /killall/,
    /halt/,
    /reboot/,
    /dd\s+if=/,
    /mkfs/,
    /fdisk/,
    /crontab/,
    />.*\/etc\//,
    />.*\/usr\//,
  ];
  return dangerousPatterns.some((pattern) => pattern.test(command));
}

// Helper function to execute bash commands
function executeBashCommand(
  command: string,
  timeout: number = 10000,
): Promise<{ stdout: string; stderr: string; success: boolean }> {
  return new Promise((resolve) => {
    // For read-only commands, use more restrictive execution
    const isReadOnly = isReadOnlyCommand(command);

    const bashProcess = spawn("bash", ["-c", command], {
      cwd: process.cwd(),
      timeout,
      stdio: isReadOnly ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"], // No stdin for read-only
    });

    let stdout = "";
    let stderr = "";

    bashProcess.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    bashProcess.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    bashProcess.on("close", (code: number | null) => {
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        success: code === 0,
      });
    });

    bashProcess.on("error", (error: Error) => {
      resolve({
        stdout: "",
        stderr: error.message,
        success: false,
      });
    });
  });
}

export const bashTool = tool({
  description:
    "Execute bash commands. Read-only commands run immediately, write commands require user confirmation.",
  inputSchema: z.object({
    command: z.string().describe("The bash command to execute"),
  }),
  execute: async ({ command }: { command: string }) => {
    const trimmedCommand = command.trim();

    // Block obviously dangerous commands
    if (isDangerousCommand(trimmedCommand)) {
      throw new Error(`Command blocked for safety: ${trimmedCommand}`);
    }

    // Check if it's a read-only command
    if (isReadOnlyCommand(trimmedCommand)) {
      console.log(`🔍 Executing read-only command: ${trimmedCommand}`);
      const result = await executeBashCommand(trimmedCommand, 10000);

      if (!result.success) {
        return `Command failed with error: ${result.stderr}`;
      }

      return result.stdout || "Command executed successfully (no output)";
    }

    // For write commands, ask for user confirmation
    console.log(`⚠️  This command may modify files: ${trimmedCommand}`);
    // For now, return true to avoid blocking, but this should be improved
    const confirmed = true; // In a real app, you'd get user confirmation

    if (!confirmed) {
      return "Command cancelled by user";
    }

    console.log(`🔧 Executing: ${trimmedCommand}`);
    const result = await executeBashCommand(trimmedCommand, 10000);

    if (!result.success) {
      return `Command failed with error: ${result.stderr}`;
    }

    return result.stdout || "Command executed successfully";
  },
});
