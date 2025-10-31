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

    // Helper function to format bytes in human-readable format
    const formatSize = (bytes: number): string => {
      if (bytes === 0) return "0B";
      const k = 1024;
      const sizes = ["B", "K", "M", "G", "T"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return Math.round(bytes / Math.pow(k, i)) + sizes[i]!;
    };

    for (const item of items) {
      const itemPath = path.join(absolutePath, item);
      const itemStats = fs.statSync(itemPath);
      const isDir = itemStats.isDirectory();
      const size = isDir ? "-" : formatSize(itemStats.size);
      const name = `${item}${isDir ? "/" : ""}`;
      results.push(`${size.padStart(8)} ${name}`);
    }

    return results.join("\n");
  },
});
