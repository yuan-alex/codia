import { tool } from "ai";
import fs from "fs";
import path from "path";
import { z } from "zod";

export const catTool = tool({
  description: "Read and display file contents",
  inputSchema: z.object({
    filePath: z.string().describe("Path to the file to read"),
  }),
  execute: async ({ filePath }) => {
    const cwd = process.cwd();
    const absolutePath = path.resolve(filePath);
    const relativePath = path.relative(cwd, absolutePath);

    // Block access to sensitive file types
    const sensitiveExtensions = [".key", ".pem", ".crt", ".p12", ".ppk"];
    const sensitiveFiles = [
      "passwd",
      "shadow",
      "authorized_keys",
      "id_rsa",
      "id_dsa",
      "id_ecdsa",
      "id_ed25519",
    ];

    const fileName = path.basename(absolutePath).toLowerCase();
    const fileExt = path.extname(absolutePath).toLowerCase();

    if (
      sensitiveExtensions.includes(fileExt) ||
      sensitiveFiles.some((sf) => fileName.includes(sf))
    ) {
      throw new Error(`Access denied: Cannot read potentially sensitive file`);
    }

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }

    const stats = fs.statSync(absolutePath);
    if (!stats.isFile()) {
      throw new Error(`Path is not a file: ${filePath}`);
    }

    // Check file size (limit to reasonable size)
    const maxSize = 1024 * 1024; // 1MB limit
    if (stats.size > maxSize) {
      throw new Error(
        `File too large to read (${stats.size} bytes > ${maxSize} bytes)`,
      );
    }

    const content = fs.readFileSync(absolutePath, "utf8");
    return content;
  },
});
