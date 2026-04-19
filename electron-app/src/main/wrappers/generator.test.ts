import { describe, expect, it } from "vitest";

describe("Phase 5 wrapper generation contract", () => {
  it("generates deterministic Codex wrapper scripts and manual setup commands without mutating shell profiles", async () => {
    const generator = await loadGenerator();

    const result = generator.generateProviderWrapper({
      appUserDataDir: "/tmp/ClaudeUsage",
      nativeCommandPath: "/opt/homebrew/bin/codex",
      platform: "darwin",
      providerId: "codex",
      shell: "zsh"
    });

    expect(result).toMatchObject({
      executableName: "codex",
      providerId: "codex",
      verified: false,
      wrapperPath: "/tmp/ClaudeUsage/wrappers/codex/codex"
    });
    expect(result.wrapperVersion).toMatch(/^5\./u);
    expect(result.files).toEqual([
      expect.objectContaining({
        content: expect.stringContaining("/opt/homebrew/bin/codex"),
        mode: 0o755,
        path: "/tmp/ClaudeUsage/wrappers/codex/codex"
      })
    ]);
    expect(result.setupCommands).toEqual([
      "export PATH='/tmp/ClaudeUsage/wrappers/codex':$PATH"
    ]);
    expect(result.instructions.join("\n")).toContain("manual");
    expect(result.removalInstructions.join("\n")).toContain("/tmp/ClaudeUsage/wrappers/codex");
    expect(result.mutatesShellProfiles).toBe(false);
    expect(result.shellProfilesTouched).toEqual([]);
  });

  it("generates Gemini wrappers that capture only derived invocation metadata", async () => {
    const generator = await loadGenerator();

    const result = generator.generateProviderWrapper({
      appUserDataDir: "/Users/example/Library/Application Support/ClaudeUsage",
      nativeCommandPath: "/usr/local/bin/gemini",
      platform: "darwin",
      providerId: "gemini",
      shell: "zsh"
    });
    const serialized = JSON.stringify(result);
    const wrapperContent = result.files.map((file: { readonly content: string }) => file.content).join("\n");

    expect(result).toMatchObject({
      captures: ["provider_id", "invocation_id", "started_at", "ended_at", "duration_ms", "command_mode", "model", "exit_status", "limit_hit", "wrapper_version"],
      omitted: ["prompt_text", "stdout", "raw_stderr", "provider_tokens", "cookies", "session_keys"],
      providerId: "gemini"
    });
    expect(wrapperContent).toContain("CLAUDE_USAGE_WRAPPER_EVENT_PATH");
    expect(wrapperContent).not.toMatch(/stdout|prompt|session[_-]?key|access[_-]?token|cookie/iu);
    expect(serialized).not.toContain("ghp_");
    expect(serialized).not.toContain("sk-ant");
  });

  it("renders reversible setup commands for supported shells without writing when native CLIs are missing", async () => {
    const generator = await loadGenerator();

    const missingNative = await generator.generateAndWriteProviderWrapper({
      appUserDataDir: "/tmp/ClaudeUsage",
      nativeCommandPath: null,
      platform: "darwin",
      providerId: "codex",
      shell: "fish"
    });
    const powershell = generator.generateProviderWrapper({
      appUserDataDir: "C:\\Users\\Example\\AppData\\Roaming\\ClaudeUsage",
      nativeCommandPath: "C:\\Program Files\\Gemini\\gemini.cmd",
      platform: "win32",
      providerId: "gemini",
      shell: "powershell"
    });

    expect(missingNative).toMatchObject({
      command: null,
      files: [],
      mutatesShellProfiles: false,
      setupCommands: ["fish_add_path '/tmp/ClaudeUsage/wrappers/codex'"],
      shellProfilesTouched: [],
      verified: false
    });
    expect(missingNative.instructions.join("\n")).toContain("Install the native Codex CLI first");
    expect(missingNative.removalInstructions.join("\n")).toContain("No generated wrapper was written");

    expect(powershell.setupCommands).toEqual([
      "$env:Path = 'C:\\Users\\Example\\AppData\\Roaming\\ClaudeUsage\\wrappers\\gemini;' + $env:Path"
    ]);
    expect(powershell.removalInstructions.join("\n")).toContain("wrappers\\gemini");
    expect(powershell.mutatesShellProfiles).toBe(false);
    expect(powershell.shellProfilesTouched).toEqual([]);
  });
});

async function loadGenerator(): Promise<Record<string, any>> {
  const modulePath = "./generator.js";
  return import(modulePath) as Promise<Record<string, any>>;
}
