import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { chmod } from "node:fs/promises";
import { dirname, delimiter, join, win32 } from "node:path";
import type { ProviderId } from "../../shared/types/provider.js";
import type { WrapperSetupResult } from "../../shared/types/ipc.js";

export const wrapperVersion = "5.0.0";

const supportedProviders = {
  codex: {
    displayName: "Codex",
    executableName: "codex"
  },
  gemini: {
    displayName: "Gemini",
    executableName: "gemini"
  }
} as const;

const capturedFields = [
  "provider_id",
  "invocation_id",
  "started_at",
  "ended_at",
  "duration_ms",
  "command_mode",
  "model",
  "exit_status",
  "limit_hit",
  "wrapper_version"
] as const;

const omittedFields = [
  "prompt_text",
  "stdout",
  "raw_stderr",
  "provider_tokens",
  "cookies",
  "session_keys"
] as const;

export type SupportedWrapperProviderId = keyof typeof supportedProviders;
export type WrapperPlatform = NodeJS.Platform | "darwin" | "linux" | "win32";
export type WrapperShell = "bash" | "zsh" | "fish" | "powershell" | "cmd" | (string & {});

export interface GeneratedWrapperFile {
  readonly path: string;
  readonly content: string;
  readonly mode: number;
}

export interface GenerateProviderWrapperInput {
  readonly appUserDataDir: string;
  readonly nativeCommandPath: string;
  readonly platform?: WrapperPlatform;
  readonly providerId: ProviderId;
  readonly shell?: WrapperShell;
}

export interface PersistProviderWrapperInput extends Omit<GenerateProviderWrapperInput, "nativeCommandPath"> {
  readonly nativeCommandPath?: string | null;
}

export interface WrapperGenerationServiceOptions {
  readonly appUserDataDir: string;
  readonly platform?: WrapperPlatform;
  readonly shell?: WrapperShell;
  readonly env?: NodeJS.ProcessEnv;
  readonly nativeCommandResolver?: (providerId: SupportedWrapperProviderId) => string | null;
}

export interface GeneratedWrapperSetup extends WrapperSetupResult {
  readonly captures: readonly string[];
  readonly executableName: string;
  readonly files: readonly GeneratedWrapperFile[];
  readonly mutatesShellProfiles: false;
  readonly omitted: readonly string[];
  readonly removalInstructions: readonly string[];
  readonly setupCommands: readonly string[];
  readonly shellProfilesTouched: readonly string[];
  readonly wrapperPath: string;
  readonly wrapperVersion: string;
}

export interface WrapperGenerationService {
  readonly generateWrapper: (providerId: ProviderId) => Promise<GeneratedWrapperSetup>;
}

export function generateProviderWrapper(input: GenerateProviderWrapperInput): GeneratedWrapperSetup {
  const provider = getSupportedProvider(input.providerId);
  const platform = input.platform ?? process.platform;
  const wrapperDir = joinForPlatform(platform, input.appUserDataDir, "wrappers", input.providerId);
  const executableName = platform === "win32" ? `${provider.executableName}.cmd` : provider.executableName;
  const wrapperPath = joinForPlatform(platform, wrapperDir, executableName);
  const setupCommands = createSetupCommands({
    platform,
    shell: input.shell,
    wrapperDir
  });

  return {
    captures: capturedFields,
    command: setupCommands[0] ?? null,
    executableName: provider.executableName,
    files: [
      {
        content:
          platform === "win32"
            ? createWindowsCommandWrapper({
                nativeCommandPath: input.nativeCommandPath,
                providerId: input.providerId,
                wrapperVersion
              })
            : createPosixWrapper({
                nativeCommandPath: input.nativeCommandPath,
                providerId: input.providerId,
                wrapperVersion
              }),
        mode: platform === "win32" ? 0o644 : 0o755,
        path: wrapperPath
      }
    ],
    instructions: [
      `Run the setup command manually in your shell to put the ${provider.displayName} Accuracy Mode wrapper before the native CLI.`,
      "The app writes only to its own support directory and never edits shell profiles or PATH automatically.",
      "Restart open terminals after adding the wrapper directory to PATH."
    ],
    mutatesShellProfiles: false,
    omitted: omittedFields,
    providerId: input.providerId,
    removalInstructions: [
      `Remove ${quotePathForInstruction(wrapperDir)} from PATH or delete the manual PATH line you added.`,
      `Delete ${quotePathForInstruction(wrapperPath)} to remove the generated ${provider.displayName} wrapper.`
    ],
    setupCommands,
    shellProfilesTouched: [],
    verified: false,
    wrapperPath,
    wrapperVersion
  };
}

export async function generateAndWriteProviderWrapper(
  input: PersistProviderWrapperInput
): Promise<GeneratedWrapperSetup> {
  const provider = getSupportedProvider(input.providerId);
  const nativeCommandPath =
    input.nativeCommandPath === undefined
      ? resolveNativeCommandPath(provider.executableName, {
          env: process.env,
          platform: input.platform ?? process.platform,
          wrapperRoot: join(input.appUserDataDir, "wrappers")
        })
      : input.nativeCommandPath;

  if (!nativeCommandPath) {
    return createMissingNativeCommandResult({
      appUserDataDir: input.appUserDataDir,
      platform: input.platform ?? process.platform,
      providerId: input.providerId,
      shell: input.shell
    });
  }

  const result = generateProviderWrapper({
    ...input,
    nativeCommandPath
  });

  for (const file of result.files) {
    mkdirSync(dirname(file.path), { recursive: true });
    writeFileSync(file.path, file.content, { mode: file.mode });
    await chmod(file.path, file.mode);
  }

  return result;
}

export function createWrapperGenerationService(options: WrapperGenerationServiceOptions): WrapperGenerationService {
  return {
    generateWrapper: async (providerId: ProviderId): Promise<GeneratedWrapperSetup> => {
      assertSupportedProviderId(providerId);
      const provider = getSupportedProvider(providerId);
      const nativeCommandPath =
        options.nativeCommandResolver?.(providerId) ??
        resolveNativeCommandPath(provider.executableName, {
          env: options.env ?? process.env,
          platform: options.platform ?? process.platform,
          wrapperRoot: join(options.appUserDataDir, "wrappers")
        });

      return generateAndWriteProviderWrapper({
        appUserDataDir: options.appUserDataDir,
        nativeCommandPath,
        platform: options.platform ?? process.platform,
        providerId,
        shell: options.shell
      });
    }
  };
}

function createMissingNativeCommandResult(input: {
  readonly appUserDataDir: string;
  readonly platform: WrapperPlatform;
  readonly providerId: ProviderId;
  readonly shell?: WrapperShell;
}): GeneratedWrapperSetup {
  const provider = getSupportedProvider(input.providerId);
  const wrapperDir = joinForPlatform(input.platform, input.appUserDataDir, "wrappers", input.providerId);
  const wrapperPath = joinForPlatform(
    input.platform,
    wrapperDir,
    input.platform === "win32" ? `${provider.executableName}.cmd` : provider.executableName
  );
  const setupCommands = createSetupCommands({
    platform: input.platform,
    shell: input.shell,
    wrapperDir
  });

  return {
    captures: capturedFields,
    command: null,
    executableName: provider.executableName,
    files: [],
    instructions: [
      `Install the native ${provider.displayName} CLI first, then generate the Accuracy Mode wrapper again.`,
      "The app did not edit shell profiles, PATH, or system locations."
    ],
    mutatesShellProfiles: false,
    omitted: omittedFields,
    providerId: input.providerId,
    removalInstructions: [`No generated wrapper was written. Remove ${quotePathForInstruction(wrapperDir)} from PATH if you added it manually.`],
    setupCommands,
    shellProfilesTouched: [],
    verified: false,
    wrapperPath,
    wrapperVersion
  };
}

function createSetupCommands(input: {
  readonly platform: WrapperPlatform;
  readonly shell?: WrapperShell;
  readonly wrapperDir: string;
}): readonly string[] {
  if (input.platform === "win32" || input.shell === "powershell") {
    return [`$env:Path = '${escapePowerShellSingleQuoted(input.wrapperDir)};' + $env:Path`];
  }

  if (input.shell === "fish") {
    return [`fish_add_path '${escapeSingleQuoted(input.wrapperDir)}'`];
  }

  return [`export PATH='${escapeSingleQuoted(input.wrapperDir)}':$PATH`];
}

function createPosixWrapper(input: {
  readonly nativeCommandPath: string;
  readonly providerId: ProviderId;
  readonly wrapperVersion: string;
}): string {
  const nativeCommandPath = escapeShellAssignment(input.nativeCommandPath);
  const providerId = escapeShellAssignment(input.providerId);
  const version = escapeShellAssignment(input.wrapperVersion);

  return `#!/usr/bin/env bash
set -uo pipefail

_cu_native='${nativeCommandPath}'
_cu_provider='${providerId}'
_cu_version='${version}'
_cu_started="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
_cu_start_ms="$(node -e 'console.log(Date.now())' 2>/dev/null || date +%s000)"
_cu_id="\${_cu_provider}-$(date +%s)-$$"
_cu_mode=""
_cu_model=""
_cu_next_model="0"

for _cu_arg in "$@"; do
  if [ "$_cu_next_model" = "1" ]; then
    _cu_model="$(printf "%s" "$_cu_arg" | tr -cd "A-Za-z0-9._:/@+-")"
    _cu_next_model="0"
    continue
  fi

  case "$_cu_arg" in
    -m|--model)
      _cu_next_model="1"
      ;;
    --model=*)
      _cu_model="$(printf "%s" "$_cu_arg" | sed "s/^--model=//" | tr -cd "A-Za-z0-9._:/@+-")"
      ;;
    chat|exec|run|completion|generate)
      if [ -z "$_cu_mode" ]; then
        _cu_mode="$_cu_arg"
      fi
      ;;
  esac
done

_cu_tmp="$(mktemp "\${TMPDIR:-/tmp}/claudeusage-\${_cu_provider}.XXXXXX")"
"$_cu_native" "$@" 2> "$_cu_tmp"
_cu_status=$?
_cu_ended="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
_cu_end_ms="$(node -e 'console.log(Date.now())' 2>/dev/null || date +%s000)"
_cu_duration=$((_cu_end_ms - _cu_start_ms))
_cu_limit="false"

if grep -Eiq "rate limit|usage limit|quota|cooldown|try again|reset" "$_cu_tmp"; then
  _cu_limit="true"
fi

cat "$_cu_tmp" >&2
rm -f "$_cu_tmp"

if [ -n "\${CLAUDE_USAGE_WRAPPER_EVENT_PATH:-}" ]; then
  mkdir -p "$(dirname "$CLAUDE_USAGE_WRAPPER_EVENT_PATH")"
  printf '{"provider_id":"%s","invocation_id":"%s","started_at":"%s","ended_at":"%s","duration_ms":%s,"command_mode":"%s","model":"%s","exit_status":%s,"limit_hit":%s,"wrapper_version":"%s"}\\n' "$_cu_provider" "$_cu_id" "$_cu_started" "$_cu_ended" "$_cu_duration" "$_cu_mode" "$_cu_model" "$_cu_status" "$_cu_limit" "$_cu_version" >> "$CLAUDE_USAGE_WRAPPER_EVENT_PATH"
fi

exit "$_cu_status"
`;
}

function createWindowsCommandWrapper(input: {
  readonly nativeCommandPath: string;
  readonly providerId: ProviderId;
  readonly wrapperVersion: string;
}): string {
  const nativeCommandPath = input.nativeCommandPath.replaceAll("\"", "\"\"");

  return `@echo off
setlocal
set "CLAUDE_USAGE_PROVIDER_ID=${input.providerId}"
set "CLAUDE_USAGE_WRAPPER_VERSION=${input.wrapperVersion}"
"${nativeCommandPath}" %*
exit /b %ERRORLEVEL%
`;
}

function resolveNativeCommandPath(
  executableName: string,
  input: {
    readonly env: NodeJS.ProcessEnv;
    readonly platform: WrapperPlatform;
    readonly wrapperRoot: string;
  }
): string | null {
  const pathValue = input.env.PATH ?? input.env.Path ?? input.env.path;
  if (!pathValue) {
    return null;
  }

  const executableNames = input.platform === "win32" ? createWindowsExecutableNames(executableName, input.env) : [executableName];
  const wrapperRoot = normalizePathForComparison(input.wrapperRoot);

  for (const dir of pathValue.split(pathDelimiterForPlatform(input.platform)).filter(Boolean)) {
    if (normalizePathForComparison(dir).startsWith(wrapperRoot)) {
      continue;
    }

    for (const candidateName of executableNames) {
      const candidate = joinForPlatform(input.platform, dir, candidateName);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function createWindowsExecutableNames(executableName: string, env: NodeJS.ProcessEnv): readonly string[] {
  const pathExt = env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD";
  return [
    executableName,
    ...pathExt
      .split(";")
      .filter(Boolean)
      .map((extension) => `${executableName}${extension.toLowerCase()}`)
  ];
}

function getSupportedProvider(providerId: ProviderId): (typeof supportedProviders)[SupportedWrapperProviderId] {
  assertSupportedProviderId(providerId);
  return supportedProviders[providerId];
}

function assertSupportedProviderId(providerId: ProviderId): asserts providerId is SupportedWrapperProviderId {
  if (providerId === "codex" || providerId === "gemini") {
    return;
  }
  throw new Error(`Unsupported Accuracy Mode wrapper provider: ${providerId}`);
}

function escapeSingleQuoted(value: string): string {
  return value.replaceAll("'", "'\\''");
}

function escapePowerShellSingleQuoted(value: string): string {
  return value.replaceAll("'", "''");
}

function escapeShellAssignment(value: string): string {
  return escapeSingleQuoted(value);
}

function quotePathForInstruction(value: string): string {
  return `'${escapeSingleQuoted(value)}'`;
}

function joinForPlatform(platform: WrapperPlatform, ...parts: readonly string[]): string {
  return platform === "win32" ? win32.join(...parts) : join(...parts);
}

function pathDelimiterForPlatform(platform: WrapperPlatform): string {
  return platform === "win32" ? ";" : delimiter;
}

function normalizePathForComparison(value: string): string {
  return value.replaceAll("\\", "/").replace(/\/+$/u, "").toLowerCase();
}
