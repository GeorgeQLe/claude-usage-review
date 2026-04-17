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
});

async function loadGenerator(): Promise<Record<string, any>> {
  const modulePath = "./generator.js";
  return import(modulePath) as Promise<Record<string, any>>;
}
