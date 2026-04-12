import { tool } from "ai";
import fs from "fs";
import path from "path";
import { z } from "zod";

import { assertAgentPathAllowed } from "../../server/sensitive-paths";

export const catTool = tool({
  description:
    "Read and display file contents. For large files (>100K or >1000 lines), use bash tool with 'head' or 'tail' commands instead (e.g., 'head -n 100 file.txt' or 'tail -n 50 file.txt').",
  inputSchema: z.object({
    filePath: z.string().describe("Path to the file to read"),
  }),
  execute: async ({ filePath }) => {
    const absolutePath = path.resolve(filePath);
    assertAgentPathAllowed(absolutePath);

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
