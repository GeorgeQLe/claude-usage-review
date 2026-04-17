import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export interface ResolveCodexHomeInput {
  readonly env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  readonly homeDir?: string;
}

export interface DetectCodexInstallInput extends ResolveCodexHomeInput {
  readonly installPath?: string;
}

export interface CodexAuthDetection {
  readonly configured: boolean;
  readonly accountLabel: string | null;
}

export interface CodexInstallDetection {
  readonly detected: boolean;
  readonly installPath: string;
  readonly auth: CodexAuthDetection;
  readonly diagnostics: readonly string[];
}

export function resolveCodexHome(input: ResolveCodexHomeInput = {}): string {
  const configuredHome = input.env?.CODEX_HOME?.trim();
  if (configuredHome) {
    return configuredHome;
  }

  return path.join(input.homeDir ?? homedir(), ".codex");
}

export async function detectCodexInstall(input: DetectCodexInstallInput = {}): Promise<CodexInstallDetection> {
  const installPath = input.installPath ?? resolveCodexHome(input);
  const diagnostics: string[] = [];
  const configPath = path.join(installPath, "config.toml");
  const authPath = path.join(installPath, "auth.json");

  const hasConfig = await pathExists(configPath);
  if (!hasConfig) {
    diagnostics.push("Codex configuration not found.");
  }

  const auth = await detectAuth(authPath);
  diagnostics.push(...auth.diagnostics);

  return {
    detected: hasConfig && auth.configured,
    installPath,
    auth: {
      configured: auth.configured,
      accountLabel: auth.accountLabel
    },
    diagnostics
  };
}

async function detectAuth(authPath: string): Promise<CodexAuthDetection & { readonly diagnostics: readonly string[] }> {
  if (!(await pathExists(authPath))) {
    return {
      configured: false,
      accountLabel: null,
      diagnostics: ["Codex authentication is not configured."]
    };
  }

  try {
    const parsed = JSON.parse(await readFile(authPath, "utf8")) as unknown;
    return {
      configured: true,
      accountLabel: extractAccountLabel(parsed),
      diagnostics: []
    };
  } catch {
    return {
      configured: false,
      accountLabel: null,
      diagnostics: ["Codex authentication metadata could not be read."]
    };
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function extractAccountLabel(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const accounts = value.accounts;
  if (Array.isArray(accounts)) {
    for (const account of accounts) {
      const email = isRecord(account) && typeof account.email === "string" ? account.email.trim() : "";
      if (email) {
        return email;
      }
    }
  }

  for (const key of ["email", "accountEmail", "user"] as const) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
