import path from "node:path";

/** Dotenv-style filenames (basename) the agent must not read, list, edit, or run shell against. */
export function isEnvSecretsFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (lower === ".env" || lower.startsWith(".env.")) {
    return true;
  }
  if (lower === ".envrc") {
    return true;
  }
  return false;
}

const SENSITIVE_EXTENSIONS = [".key", ".pem", ".crt", ".p12", ".ppk"];

/** Fallback when tokenizing misses a lone `.env` path segment */
const ENV_PATH_IN_COMMAND = /(?:^|\s|[/\\([(=])\s*\.env(?:\.|$|[\s'"`])/;

/** Path segment that looks like `/.env` */
const ENV_PATH_SEGMENT = /[/\\]\.env(?:\.|$|[\s'"`])/;

const SENSITIVE_BASENAME_MARKERS = [
  "passwd",
  "shadow",
  "authorized_keys",
  "id_rsa",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
];

/**
 * Throws if the resolved file path must not be accessed by agent tools (cat, edit, grep file, etc.).
 */
export function assertAgentPathAllowed(absolutePath: string): void {
  const fileName = path.basename(absolutePath).toLowerCase();
  const fileExt = path.extname(absolutePath).toLowerCase();

  if (isEnvSecretsFileName(path.basename(absolutePath))) {
    throw new Error(
      "Access denied: cannot access environment or secrets files (.env, .env.*, .envrc)"
    );
  }

  if (SENSITIVE_EXTENSIONS.includes(fileExt)) {
    throw new Error("Access denied: Cannot read potentially sensitive file");
  }

  if (SENSITIVE_BASENAME_MARKERS.some((sf) => fileName.includes(sf))) {
    throw new Error("Access denied: Cannot read potentially sensitive file");
  }
}

/**
 * True if a shell command likely targets .env / secrets files (cat, grep, redirects, etc.).
 */
export function bashReferencesEnvPath(command: string): boolean {
  const s = command.trim();
  if (!s) {
    return false;
  }

  const tokens = s.match(/(?:[^\s"']+|"[^"]*"|'[^']*'|`[^`]*`)+/g) ?? [];
  for (const raw of tokens) {
    const t = raw.replace(/^["'`]|["'`]$/g, "");
    if (!t) {
      continue;
    }
    try {
      const resolved = path.resolve(process.cwd(), t);
      if (isEnvSecretsFileName(path.basename(resolved))) {
        return true;
      }
    } catch {
      // ignore
    }
    if (isEnvSecretsFileName(path.basename(t))) {
      return true;
    }
  }

  // Fallback: path-like ".env" without being caught as a single token
  if (ENV_PATH_IN_COMMAND.test(s)) {
    return true;
  }
  if (ENV_PATH_SEGMENT.test(s)) {
    return true;
  }

  return false;
}
