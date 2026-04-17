import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { ProviderAuthMode } from "../../../shared/types/provider.js";

export interface ResolveGeminiHomeInput {
  readonly env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  readonly homeDir?: string;
}

export interface DetectGeminiInstallInput extends ResolveGeminiHomeInput {
  readonly installPath?: string;
}

export interface GeminiAuthDetection {
  readonly configured: boolean;
  readonly mode: ProviderAuthMode;
}

export interface GeminiInstallDetection {
  readonly detected: boolean;
  readonly installPath: string;
  readonly auth: GeminiAuthDetection;
  readonly degraded: boolean;
  readonly diagnostics: readonly string[];
}

const knownAuthModes = new Set<ProviderAuthMode>(["unknown", "oauth-personal", "api-key", "none"]);

export function resolveGeminiHome(input: ResolveGeminiHomeInput = {}): string {
  const configuredHome = input.env?.GEMINI_HOME?.trim();
  if (configuredHome) {
    return configuredHome;
  }

  return path.join(input.homeDir ?? homedir(), ".gemini");
}

export async function detectGeminiInstall(input: DetectGeminiInstallInput = {}): Promise<GeminiInstallDetection> {
  const installPath = input.installPath ?? resolveGeminiHome(input);
  const diagnostics: string[] = [];
  const settingsPath = path.join(installPath, "settings.json");
  const oauthPath = path.join(installPath, "oauth_creds.json");
  const homeExists = await pathExists(installPath);
  const hasSettings = await pathExists(settingsPath);
  const hasOauthCredentials = await pathExists(oauthPath);

  if (!homeExists) {
    diagnostics.push("Gemini configuration directory not found.");
  }

  const settings = hasSettings ? await readGeminiSettings(settingsPath) : null;
  diagnostics.push(...(settings?.diagnostics ?? []));
  if (!hasSettings) {
    diagnostics.push("Gemini settings file not found.");
  }

  const mode = settings?.authMode ?? (hasOauthCredentials ? "oauth-personal" : "unknown");
  const configured = mode === "api-key" || mode === "oauth-personal" || hasOauthCredentials;
  const degraded = settings?.unknownAuthMode === true || (homeExists && !configured);

  if (!configured) {
    diagnostics.push("Gemini authentication is not configured.");
  }

  return {
    detected: homeExists && (hasSettings || hasOauthCredentials),
    installPath,
    auth: {
      configured,
      mode
    },
    degraded,
    diagnostics
  };
}

async function readGeminiSettings(settingsPath: string): Promise<{
  readonly authMode: ProviderAuthMode;
  readonly unknownAuthMode: boolean;
  readonly diagnostics: readonly string[];
} | null> {
  try {
    const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as unknown;
    const authMode = readAuthMode(parsed);
    if (authMode.known) {
      return {
        authMode: authMode.mode,
        unknownAuthMode: false,
        diagnostics: []
      };
    }

    return {
      authMode: "unknown",
      unknownAuthMode: true,
      diagnostics: ["Gemini settings contain an unknown auth mode."]
    };
  } catch {
    return {
      authMode: "unknown",
      unknownAuthMode: true,
      diagnostics: ["Gemini settings could not be read."]
    };
  }
}

function readAuthMode(value: unknown): { readonly known: boolean; readonly mode: ProviderAuthMode } {
  if (!isRecord(value)) {
    return { known: true, mode: "unknown" };
  }

  const rawAuthMode = value.authMode ?? value.auth_mode ?? value.selectedAuthType;
  if (typeof rawAuthMode !== "string" || !rawAuthMode.trim()) {
    return { known: true, mode: "unknown" };
  }

  const normalized = normalizeAuthMode(rawAuthMode);
  if (!knownAuthModes.has(normalized)) {
    return { known: false, mode: "unknown" };
  }

  return { known: true, mode: normalized };
}

function normalizeAuthMode(value: string): ProviderAuthMode {
  const normalized = value.trim().toLowerCase();

  if (normalized === "oauth" || normalized === "oauth-personal" || normalized === "oauth_personal") {
    return "oauth-personal";
  }

  if (normalized === "api-key" || normalized === "api_key" || normalized === "apikey") {
    return "api-key";
  }

  if (normalized === "none" || normalized === "not-configured") {
    return "none";
  }

  if (normalized === "unknown") {
    return "unknown";
  }

  return normalized as ProviderAuthMode;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
