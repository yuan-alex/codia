import { tool } from "ai";
import fs from "fs";
import path from "path";
import { z } from "zod";

// Helper functions for grep
function searchInFile(filePath: string, pattern: string): string {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");
    const regex = new RegExp(pattern, "g");
    const matches: string[] = [];

    lines.forEach((line) => {
      if (regex.test(line)) {
        matches.push(line);
      }
    });

    return matches.length > 0
      ? matches.join("\n")
      : `No matches found for pattern: ${pattern}`;
  } catch (error) {
    throw new Error(
      `Error reading file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function searchInDirectory(dirPath: string, pattern: string): string {
  const results: string[] = [];

  const items = fs.readdirSync(dirPath);

  for (const item of items) {
    // Skip hidden files and directories
    if (item.startsWith(".")) continue;

    const itemPath = path.join(dirPath, item);
    const stats = fs.statSync(itemPath);

    if (stats.isFile()) {
      // Only search text files (basic check)
      const ext = path.extname(item).toLowerCase();
      const textExtensions = [
        ".txt",
        ".js",
        ".ts",
        ".json",
        ".md",
        ".py",
        ".java",
        ".cpp",
        ".c",
        ".h",
        ".css",
        ".html",
        ".xml",
        ".yml",
        ".yaml",
      ];

      if (textExtensions.includes(ext) || !ext) {
        try {
          const matches = searchInFile(itemPath, pattern);
          if (matches && !matches.includes("No matches found")) {
            results.push(`${itemPath}:\n${matches}`);
          }
        } catch {}
      }
    }
  }

  return results.length > 0
    ? results.join("\n\n")
    : `No matches found for pattern: ${pattern}`;
}

export const grepTool = tool({
  description: "Search for patterns in files",
  inputSchema: z.object({
    pattern: z.string().describe("Pattern to search for"),
    filePath: z
      .string()
      .optional()
      .nullable()
      .describe(
        "Specific file to search in (default: search current directory)",
      ),
  }),
  execute: async ({ pattern, filePath }) => {
    const cwd = process.cwd();

    // If specific file provided, validate it
    if (filePath) {
      const absolutePath = path.resolve(filePath);
      const relativePath = path.relative(cwd, absolutePath);

      if (!fs.existsSync(absolutePath)) {
        throw new Error(`File does not exist: ${filePath}`);
      }

      const result = searchInFile(absolutePath, pattern);
      return result;
    }

    // Search in current directory
    const result = searchInDirectory(cwd, pattern);
    return result;
  },
});
