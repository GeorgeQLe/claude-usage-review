import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DiscoverMigrationSourcesOptions, MigrationSourceCandidate } from "./types.js";

const swiftBundleId = "com.claudeusage.app";

export function discoverMigrationSources(options: DiscoverMigrationSourcesOptions): readonly MigrationSourceCandidate[] {
  const exists = options.exists ?? existsSync;
  const candidates: MigrationSourceCandidate[] = [];
  const swiftCandidate = discoverSwiftSource(options.homeDir, exists);
  const tauriCandidate = discoverTauriSource(options.homeDir, options.xdgConfigHome, exists);

  if (swiftCandidate) {
    candidates.push(swiftCandidate);
  }

  if (tauriCandidate) {
    candidates.push(tauriCandidate);
  }

  return candidates;
}

function discoverSwiftSource(
  homeDir: string,
  exists: (path: string) => boolean
): MigrationSourceCandidate | null {
  const appSupportPath = join(homeDir, "Library", "Application Support", "ClaudeUsage");
  const preferencesPath = join(homeDir, "Library", "Preferences");
  const jsonDefaultsPath = join(preferencesPath, `${swiftBundleId}.json`);
  const plistDefaultsPath = join(preferencesPath, `${swiftBundleId}.plist`);
  const userDefaultsPath = exists(jsonDefaultsPath)
    ? jsonDefaultsPath
    : exists(plistDefaultsPath)
      ? plistDefaultsPath
      : undefined;

  if (!userDefaultsPath && !exists(appSupportPath)) {
    return null;
  }

  return {
    kind: "swift",
    sourcePath: userDefaultsPath ?? appSupportPath,
    userDefaultsPath,
    appSupportPath,
    historyPath: appSupportPath
  };
}

function discoverTauriSource(
  homeDir: string,
  xdgConfigHome: string | undefined,
  exists: (path: string) => boolean
): MigrationSourceCandidate | null {
  const configBase = xdgConfigHome ?? join(homeDir, ".config");
  const configPath = join(configBase, "ClaudeUsage", "config.json");

  if (!exists(configPath)) {
    return null;
  }

  return {
    kind: "tauri",
    sourcePath: configPath,
    configPath
  };
}
