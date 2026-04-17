import { describe, expect, it } from "vitest";

describe("Phase 4 provider confidence red tests", () => {
  it("explains exact Claude confidence and passive provider estimates in user-facing language", async () => {
    const confidence = await loadConfidence();

    expect(
      confidence.explainProviderConfidence({
        confidence: "exact",
        providerId: "claude",
        source: "provider-api"
      })
    ).toContain("Claude API");
    expect(
      confidence.explainProviderConfidence({
        confidence: "estimated",
        providerId: "codex",
        source: "local-history"
      })
    ).toContain("local Codex activity");
    expect(
      confidence.explainProviderConfidence({
        confidence: "high_confidence",
        providerId: "gemini",
        source: "stats-summary"
      })
    ).toContain("/stats");
  });

  it("prevents Codex and Gemini passive sources from claiming exact remaining quota", async () => {
    const confidence = await loadConfidence();

    expect(
      confidence.deriveProviderConfidence({
        providerId: "codex",
        sources: ["history-jsonl", "session-jsonl"],
        requestedConfidence: "exact"
      })
    ).toMatchObject({
      confidence: "estimated",
      downgraded: true,
      reason: expect.stringContaining("exact")
    });
    expect(
      confidence.deriveProviderConfidence({
        providerId: "gemini",
        sources: ["session-json", "oauth-creds"],
        requestedConfidence: "exact"
      })
    ).toMatchObject({
      confidence: "estimated",
      downgraded: true
    });
  });

  it("lets verified wrapper events improve confidence while still blocking exact Codex claims", async () => {
    const confidence = await loadConfidence();

    expect(
      confidence.deriveProviderConfidence({
        providerId: "codex",
        sources: ["verified-wrapper-events", "stderr-limit-signals"],
        requestedConfidence: "exact"
      })
    ).toMatchObject({
      confidence: "high_confidence",
      downgraded: true,
      reason: expect.stringContaining("Accuracy Mode")
    });
    expect(
      confidence.explainProviderConfidence({
        confidence: "high_confidence",
        providerId: "gemini",
        source: "verified-wrapper-events"
      })
    ).toContain("Accuracy Mode");
  });
});

async function loadConfidence(): Promise<Record<string, any>> {
  const modulePath = "./providerConfidence.js";
  return import(modulePath) as Promise<Record<string, any>>;
}
