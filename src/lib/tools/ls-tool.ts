import { tool } from "ai";
import fs from "fs";
import path from "path";
import { z } from "zod";

export const lsTool = tool({
  description: "List directory contents",
  inputSchema: z.object({
    path: z
      .string()
      .optional()
      .nullable()
      .default(".")
      .describe("Directory path to list"),
  }),
  execute: async ({ path: targetPath }) => {
    const cwd = process.cwd();
    const absolutePath = path.resolve(targetPath ?? ".");
    const relativePath = path.relative(cwd, absolutePath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Path does not exist: ${targetPath}`);
    }

    const stats = fs.statSync(absolutePath);

    if (stats.isFile()) {
      // If it's a file, just show the file name
      return path.basename(absolutePath);
    }

    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory or file: ${targetPath}`);
    }

    const items = fs.readdirSync(absolutePath);
    const results: string[] = [];

    for (const item of items) {
      const itemPath = path.join(absolutePath, item);
      const itemStats = fs.statSync(itemPath);
      results.push(`${item}${itemStats.isDirectory() ? "/" : ""}`);
    }

    return results.join("\n");
  },
});
