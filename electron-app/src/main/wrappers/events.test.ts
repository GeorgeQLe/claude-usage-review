import { afterEach, describe, expect, it } from "vitest";
import { openAppDatabase, type OpenedAppDatabase } from "../storage/database.js";

let opened: OpenedAppDatabase | null = null;

describe("Phase 5 wrapper event ledger contract", () => {
  afterEach(() => {
    opened?.close();
    opened = null;
  });

  it("records wrapper invocation starts and finishes with derived metadata only", async () => {
    const store = await createStore();

    store.recordWrapperInvocationStarted({
      commandMode: "chat",
      invocationId: "invocation-1",
      model: "gpt-5.4",
      providerId: "codex",
      startedAt: "2026-04-17T14:00:00.000Z",
      wrapperVersion: "5.0.0"
    });
    store.recordWrapperInvocationFinished({
      endedAt: "2026-04-17T14:00:01.250Z",
      exitStatus: 124,
      invocationId: "invocation-1",
      providerId: "codex",
      stderrLimitSignal: {
        limitHit: true,
        redactedDiagnostics: ["Rate limit reached. Try again after 5:00 PM."]
      },
      stdout: "private answer text that must never be persisted"
    });

    const events = store.listRecentWrapperEvents({
      limit: 10,
      providerId: "codex",
      since: "2026-04-17T00:00:00.000Z"
    });

    expect(events).toEqual([
      expect.objectContaining({
        commandMode: "chat",
        durationMs: 1250,
        exitStatus: 124,
        invocationId: "invocation-1",
        limitHit: true,
        model: "gpt-5.4",
        providerId: "codex",
        wrapperVersion: "5.0.0"
      })
    ]);
    expect(JSON.stringify(events)).not.toMatch(/private answer|prompt|stdout|raw stderr|access[_-]?token|session[_-]?key|cookie/iu);
  });

  it("enforces provider invocation uniqueness and returns privacy-safe diagnostics summaries", async () => {
    const store = await createStore();

    store.recordWrapperInvocationStarted({
      invocationId: "invocation-1",
      providerId: "gemini",
      startedAt: "2026-04-17T14:00:00.000Z",
      wrapperVersion: "5.0.0"
    });
    expect(() =>
      store.recordWrapperInvocationStarted({
        invocationId: "invocation-1",
        providerId: "gemini",
        startedAt: "2026-04-17T14:00:01.000Z",
        wrapperVersion: "5.0.0"
      })
    ).toThrow(/unique|duplicate|invocation/iu);

    const summary = store.summarizeWrapperEvents({
      providerId: "gemini",
      since: "2026-04-17T00:00:00.000Z"
    });

    expect(summary).toMatchObject({
      invocationCount: 1,
      limitHitCount: 0,
      providerId: "gemini"
    });
    expect(JSON.stringify(summary)).not.toMatch(/prompt|stdout|stderr|oauth|token|cookie/iu);
  });

  it("bounds recent-event reads while preserving provider and time-window filters", async () => {
    let nextId = 0;
    const store = await createStore({ idFactory: () => `event-${++nextId}` });

    for (const event of [
      { invocationId: "codex-early", providerId: "codex", startedAt: "2026-04-17T13:00:00.000Z" },
      { invocationId: "codex-mid", providerId: "codex", startedAt: "2026-04-17T14:30:00.000Z" },
      { invocationId: "gemini-mid", providerId: "gemini", startedAt: "2026-04-17T14:45:00.000Z" },
      { invocationId: "codex-late", providerId: "codex", startedAt: "2026-04-17T14:59:00.000Z" }
    ] as const) {
      store.recordWrapperInvocationStarted({
        commandMode: "chat",
        invocationId: event.invocationId,
        providerId: event.providerId,
        startedAt: event.startedAt,
        wrapperVersion: "5.0.0"
      });
    }

    const recentCodex = store.listRecentWrapperEvents({
      limit: 2,
      providerId: "codex",
      since: "2026-04-17T14:00:00.000Z"
    });

    expect(recentCodex.map((event: { readonly invocationId: string }) => event.invocationId)).toEqual([
      "codex-late",
      "codex-mid"
    ]);
    expect(JSON.stringify(recentCodex)).not.toContain("gemini-mid");
    expect(JSON.stringify(recentCodex)).not.toContain("codex-early");
  });
});

async function createStore(options: { readonly idFactory?: () => string } = {}): Promise<Record<string, any>> {
  opened = openAppDatabase({ path: ":memory:" });
  const modulePath = "../storage/wrapperEvents.js";
  const module = (await import(modulePath)) as Record<string, any>;
  return module.createWrapperEventStore({
    database: opened.database,
    idFactory: options.idFactory ?? (() => "event-1"),
    now: () => "2026-04-17T14:00:00.000Z"
  });
}
