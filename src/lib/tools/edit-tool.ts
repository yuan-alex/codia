import { tool } from "ai";
import fs from "fs";
import path from "path";
import { z } from "zod";

// Helper function to validate file path security
function validateFilePath(filePath: string): {
  absolutePath: string;
  relativePath: string;
} {
  const cwd = process.cwd();
  const absolutePath = path.resolve(filePath);
  const relativePath = path.relative(cwd, absolutePath);

  // Block access to sensitive files
  const sensitiveExtensions = [".key", ".pem", ".crt", ".p12", ".ppk", ".env"];
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
    throw new Error(`Access denied: Cannot edit potentially sensitive file`);
  }

  return { absolutePath, relativePath };
}

// Helper function to create backup
function createBackup(filePath: string): string {
  const backupPath = `${filePath}.backup.${Date.now()}`;
  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, backupPath);
  }
  return backupPath;
}

// Helper function to perform search and replace
function searchReplaceInFile(
  filePath: string,
  oldString: string,
  newString: string,
  replaceAll: boolean = false,
): { success: boolean; changes: number; backupPath: string } {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File does not exist: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf8");
  const backupPath = createBackup(filePath);

  let newContent: string;
  let changes: number;

  if (replaceAll) {
    // Replace all occurrences
    const regex = new RegExp(
      oldString.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "g",
    );
    newContent = content.replace(regex, newString);
    changes = (content.match(regex) || []).length;
  } else {
    // Replace first occurrence only
    const index = content.indexOf(oldString);
    if (index === -1) {
      throw new Error(`Text "${oldString}" not found in file`);
    }
    newContent = content.replace(oldString, newString);
    changes = 1;
  }

  fs.writeFileSync(filePath, newContent, "utf8");
  return { success: true, changes, backupPath };
}

export const editTool = tool({
  description:
    "Edit files using search and replace operations. Supports both single and multiple replacements with automatic backup creation.",
  inputSchema: z.object({
    filePath: z.string().describe("Path to the file to edit"),
    oldString: z
      .string()
      .describe(
        "Text to replace (must be unique in the file unless replaceAll is true)",
      ),
    newString: z.string().describe("Text to replace it with"),
    replaceAll: z
      .boolean()
      .optional()
      .default(false)
      .describe("Replace all occurrences (default: false)"),
  }),
  // Require approval for all file edits since they modify files
  needsApproval: true,
  execute: async ({ filePath, oldString, newString, replaceAll = false }) => {
    // Validate file path
    const { absolutePath } = validateFilePath(filePath);

    // Check if file exists
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }

    // Get file stats for size check
    const stats = fs.statSync(absolutePath);
    const maxSize = 10 * 1024 * 1024; // 10MB limit
    if (stats.size > maxSize) {
      throw new Error(
        `File too large to edit (${stats.size} bytes > ${maxSize} bytes)`,
      );
    }

    // Validate oldString is not empty for safety
    if (!oldString.trim()) {
      throw new Error("oldString cannot be empty");
    }

    // Perform the edit
    const result = searchReplaceInFile(
      absolutePath,
      oldString,
      newString,
      replaceAll,
    );

    return `Successfully edited ${filePath}: ${result.changes} change(s) made. Backup created at ${result.backupPath}`;
  },
});
