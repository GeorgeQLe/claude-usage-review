import { describe, expect, it } from "vitest";

describe("Phase 4 Gemini adapter red tests", () => {
  it("combines passive session activity with profile-aware headroom and stale state", async () => {
    const adapter = await loadAdapter();
    const snapshot = await adapter.refreshGeminiProviderSnapshot({
      detector: async () => ({ auth: { mode: "oauth-personal" }, detected: true }),
      now: new Date("2026-04-17T15:00:00.000Z"),
      profile: { dailyRequestLimit: 1000, label: "Personal" },
      sessionReader: async () => ({
        summary: {
          dailyRequestCount: 125,
          lastObservedAt: "2026-04-17T14:59:00.000Z",
          model: "gemini-2.5-pro",
          requestsPerMinute: 3,
          tokenCount: 2048
        }
      }),
      staleAfterMs: 15 * 60 * 1000
    });

    expect(snapshot.card).toMatchObject({
      adapterMode: "passive",
      confidence: "estimated",
      dailyRequestCount: 125,
      displayName: "Gemini",
      providerId: "gemini",
      requestsPerMinute: 3,
      status: "configured"
    });
    expect(snapshot.dailyHeadroom).toBe(875);
    expect(JSON.stringify(snapshot)).not.toContain("oauth");
    expect(JSON.stringify(snapshot)).not.toContain("prompt");
  });

  it("marks degraded adapters and keeps diagnostics redacted", async () => {
    const adapter = await loadAdapter();
    const snapshot = await adapter.refreshGeminiProviderSnapshot({
      detector: async () => ({ degraded: true, detected: true, diagnostics: ["oauth_creds.json is unreadable"] }),
      now: new Date("2026-04-17T15:00:00.000Z"),
      sessionReader: async () => ({ summary: { dailyRequestCount: 0 } }),
      staleAfterMs: 15 * 60 * 1000
    });

    expect(snapshot.card).toMatchObject({
      confidence: "observed_only",
      status: "degraded"
    });
    expect(JSON.stringify(snapshot)).not.toContain("access_token");
    expect(JSON.stringify(snapshot)).not.toContain("apiKey");
  });
});

async function loadAdapter(): Promise<Record<string, any>> {
  const modulePath = "./adapter.js";
  return import(modulePath) as Promise<Record<string, any>>;
}
