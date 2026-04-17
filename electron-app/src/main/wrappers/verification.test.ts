import { describe, expect, it, vi } from "vitest";

describe("Phase 5 wrapper verification contract", () => {
  it("detects when codex resolves to the generated wrapper and probes only a harmless native version command", async () => {
    const verification = await loadVerification();
    const runner = vi.fn(async () => ({ exitStatus: 0, stderr: "", stdout: "codex 1.2.3\n" }));

    const result = await verification.verifyProviderWrapper({
      commandResolver: async (command: string) =>
        command === "codex" ? "/tmp/ClaudeUsage/wrappers/codex/codex" : "/opt/homebrew/bin/codex",
      generatedWrapperPath: "/tmp/ClaudeUsage/wrappers/codex/codex",
      nativeCommandPath: "/opt/homebrew/bin/codex",
      providerId: "codex",
      runner,
      wrapperVersion: "5.0.0"
    });

    expect(result).toMatchObject({
      providerId: "codex",
      status: "wrapper_active",
      verified: true,
      wrapperVersion: "5.0.0"
    });
    expect(runner).toHaveBeenCalledWith({
      args: ["--version"],
      command: "/opt/homebrew/bin/codex",
      timeoutMs: expect.any(Number)
    });
    expect(JSON.stringify(result)).not.toMatch(/PATH=.*:|access[_-]?token|prompt|stdout|raw stderr/iu);
  });

  it("classifies missing, native-only, and stale Gemini wrapper setups with redacted messages", async () => {
    const verification = await loadVerification();

    await expect(
      verification.verifyProviderWrapper({
        commandResolver: async () => null,
        generatedWrapperPath: "/tmp/ClaudeUsage/wrappers/gemini/gemini",
        nativeCommandPath: null,
        providerId: "gemini",
        runner: vi.fn(),
        wrapperVersion: "5.0.0"
      })
    ).resolves.toMatchObject({
      providerId: "gemini",
      status: "missing_command",
      verified: false
    });

    await expect(
      verification.verifyProviderWrapper({
        commandResolver: async () => "/usr/local/bin/gemini",
        generatedWrapperPath: "/tmp/ClaudeUsage/wrappers/gemini/gemini",
        nativeCommandPath: "/usr/local/bin/gemini",
        providerId: "gemini",
        runner: vi.fn(async () => ({
          exitStatus: 0,
          stderr: "oauth_creds={\"access_token\":\"secret\"}",
          stdout: "gemini 2.0"
        })),
        wrapperVersion: "5.0.0"
      })
    ).resolves.toMatchObject({
      providerId: "gemini",
      status: "native_cli_active",
      verified: false
    });
  });
});

async function loadVerification(): Promise<Record<string, any>> {
  const modulePath = "./verification.js";
  return import(modulePath) as Promise<Record<string, any>>;
}
