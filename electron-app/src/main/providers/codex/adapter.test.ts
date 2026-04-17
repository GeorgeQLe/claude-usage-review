import { describe, expect, it } from "vitest";

describe("Phase 4 Codex adapter red tests", () => {
  it("combines detection, history, sessions, bookmarks, stale state, and redacted diagnostics", async () => {
    const adapter = await loadAdapter();
    const snapshot = await adapter.refreshCodexProviderSnapshot({
      detector: async () => ({ accountLabel: "user@example.com", detected: true }),
      historyReader: async () => ({
        bookmark: { byteOffset: 128 },
        events: [{ occurredAt: "2026-04-17T14:00:00.000Z", source: "history-jsonl" }]
      }),
      now: new Date("2026-04-17T15:00:00.000Z"),
      sessionReader: async () => ({
        events: [{ occurredAt: "2026-04-17T14:55:00.000Z", model: "gpt-5.4", tokenCount: 1024 }]
      }),
      staleAfterMs: 10 * 60 * 1000
    });

    expect(snapshot.card).toMatchObject({
      adapterMode: "passive",
      confidence: "estimated",
      displayName: "Codex",
      providerId: "codex",
      status: "configured"
    });
    expect(snapshot.bookmarks).toMatchObject({ historyByteOffset: 128 });
    expect(JSON.stringify(snapshot)).not.toContain("prompt");
    expect(JSON.stringify(snapshot)).not.toContain("access_token");
  });

  it("marks Codex stale or degraded without claiming exact remaining quota", async () => {
    const adapter = await loadAdapter();
    const snapshot = await adapter.refreshCodexProviderSnapshot({
      detector: async () => ({ detected: true }),
      historyReader: async () => ({ bookmark: { byteOffset: 0 }, events: [] }),
      now: new Date("2026-04-17T15:00:00.000Z"),
      sessionReader: async () => ({
        events: [{ occurredAt: "2026-04-17T12:00:00.000Z", limitHit: true }]
      }),
      staleAfterMs: 30 * 60 * 1000
    });

    expect(snapshot.card).toMatchObject({
      confidence: expect.not.stringMatching(/^exact$/u),
      status: "stale"
    });
    expect(snapshot.card.detailText).toContain("stale");
  });
});

async function loadAdapter(): Promise<Record<string, any>> {
  const modulePath = "./adapter.js";
  return import(modulePath) as Promise<Record<string, any>>;
}
