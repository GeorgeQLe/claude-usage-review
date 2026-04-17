import { describe, expect, it } from "vitest";

describe("Phase 5 wrapper stderr scanner contract", () => {
  it("detects Codex limit and reset hints from stderr while ignoring stdout", async () => {
    const scanner = await loadScanner();

    const result = scanner.scanWrapperStderrForLimitSignals({
      providerId: "codex",
      stderr: "Rate limit reached. Try again after 5:00 PM.",
      stdout: "stdout says rate limit reached but must be ignored"
    });

    expect(result).toMatchObject({
      limitHit: true,
      providerId: "codex",
      resetHint: "5:00 PM"
    });
    expect(result.redactedDiagnostics.join("\n")).toContain("Rate limit reached");
    expect(result.redactedDiagnostics.join("\n")).not.toContain("stdout says");
  });

  it("detects Gemini quota, cooldown, and lockout messages without preserving raw command output", async () => {
    const scanner = await loadScanner();

    const result = scanner.scanWrapperStderrForLimitSignals({
      providerId: "gemini",
      stderr: "Quota exhausted for gemini-2.5-pro. Cooldown until 2026-04-18T00:00:00Z. access_token=secret",
      stdout: "prompt: write a private message"
    });

    expect(result).toMatchObject({
      limitHit: true,
      providerId: "gemini",
      resetAt: "2026-04-18T00:00:00.000Z"
    });
    expect(JSON.stringify(result)).not.toContain("access_token=secret");
    expect(JSON.stringify(result)).not.toContain("prompt:");
  });
});

async function loadScanner(): Promise<Record<string, any>> {
  const modulePath = "./stderrScanner.js";
  return import(modulePath) as Promise<Record<string, any>>;
}
