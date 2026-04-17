import { describe, expect, it } from "vitest";

describe("Phase 4 Gemini /stats red tests", () => {
  it("parses reliable /stats summaries without running the real CLI", async () => {
    const stats = await loadStats();

    const summary = stats.parseGeminiStatsSummary(`
      Gemini Code Assist usage
      Requests today: 42 / 1000
      Tokens today: 123456
      Model: gemini-2.5-pro
      Reset: 2026-04-18T00:00:00.000Z
    `);

    expect(summary).toMatchObject({
      confidence: "high_confidence",
      dailyLimit: 1000,
      dailyRequestCount: 42,
      model: "gemini-2.5-pro",
      resetAt: "2026-04-18T00:00:00.000Z",
      tokenCount: 123456
    });
  });

  it("reports unsupported or missing /stats output as observed-only diagnostics", async () => {
    const stats = await loadStats();

    expect(stats.parseGeminiStatsSummary("Unknown command: /stats")).toMatchObject({
      confidence: "observed_only",
      diagnostics: expect.arrayContaining([expect.stringContaining("unsupported")])
    });
    expect(stats.redactGeminiStatsDiagnostics("oauth token abc123 and API_KEY=secret")).not.toMatch(/abc123|secret/u);
  });

  it("reports missing CLI failures through the helper boundary without leaking command secrets", async () => {
    const stats = await loadStats();

    const summary = await stats.readGeminiStatsSummary({
      runner: async () => {
        throw new Error("spawn gemini ENOENT api_key=secret");
      }
    });

    expect(summary).toMatchObject({
      confidence: "observed_only",
      diagnostics: expect.arrayContaining([expect.stringContaining("failed")])
    });
    expect(JSON.stringify(summary)).not.toContain("secret");
  });
});

async function loadStats(): Promise<Record<string, any>> {
  const modulePath = "./stats.js";
  return import(modulePath) as Promise<Record<string, any>>;
}
