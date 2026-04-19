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

  it("uses verified wrapper events to upgrade Codex confidence without claiming exact usage", async () => {
    const adapter = await loadAdapter();
    const snapshot = await adapter.refreshCodexProviderSnapshot({
      detector: async () => ({ accountLabel: "user@example.com", detected: true }),
      historyReader: async () => ({ bookmark: { byteOffset: 128 }, events: [] }),
      now: new Date("2026-04-17T15:00:00.000Z"),
      sessionReader: async () => ({ events: [] }),
      staleAfterMs: 30 * 60 * 1000,
      wrapperEventReader: async () => ({
        events: [
          {
            commandMode: "chat",
            durationMs: 1200,
            invocationId: "codex-wrapper-1",
            limitHit: true,
            model: "gpt-5.4",
            providerId: "codex",
            startedAt: "2026-04-17T14:58:00.000Z",
            wrapperVersion: "5.0.0"
          },
          {
            commandMode: "edit",
            durationMs: 900,
            invocationId: "codex-wrapper-2",
            limitHit: false,
            model: "gpt-5.4",
            providerId: "codex",
            startedAt: "2026-04-17T14:59:00.000Z",
            wrapperVersion: "5.0.0"
          }
        ],
        verified: true
      })
    });

    expect(snapshot.card).toMatchObject({
      adapterMode: "accuracy",
      confidence: "high_confidence",
      dailyRequestCount: 2,
      providerId: "codex",
      status: "configured"
    });
    expect(snapshot.card.confidence).not.toBe("exact");
    expect(snapshot.card.confidenceExplanation).toContain("Accuracy Mode");
    expect(JSON.stringify(snapshot)).not.toMatch(/prompt|stdout|raw stderr|access[_-]?token|session[_-]?key/iu);
  });

  it("keeps passive Codex fallback when wrapper events are unverified", async () => {
    const adapter = await loadAdapter();
    const snapshot = await adapter.refreshCodexProviderSnapshot({
      detector: async () => ({ accountLabel: "user@example.com", detected: true }),
      historyReader: async () => ({ bookmark: { byteOffset: 256 }, events: [] }),
      now: new Date("2026-04-17T15:00:00.000Z"),
      sessionReader: async () => ({
        events: [{ occurredAt: "2026-04-17T14:57:00.000Z", model: "gpt-5.4", tokenCount: 512 }]
      }),
      staleAfterMs: 30 * 60 * 1000,
      wrapperEventReader: async () => ({
        diagnostics: ["Wrapper verification is incomplete."],
        events: [
          {
            invocationId: "codex-unverified-1",
            limitHit: true,
            providerId: "codex",
            startedAt: "2026-04-17T14:59:00.000Z",
            wrapperVersion: "5.0.0"
          }
        ],
        verified: false
      })
    });

    expect(snapshot.card).toMatchObject({
      adapterMode: "passive",
      confidence: "estimated",
      dailyRequestCount: 1,
      status: "configured"
    });
    expect(snapshot.card.confidenceExplanation).not.toContain("Accuracy Mode");
    expect(JSON.stringify(snapshot)).not.toMatch(/prompt|stdout|raw stderr|access[_-]?token|session[_-]?key/iu);
  });
});

async function loadAdapter(): Promise<Record<string, any>> {
  const modulePath = "./adapter.js";
  return import(modulePath) as Promise<Record<string, any>>;
}
