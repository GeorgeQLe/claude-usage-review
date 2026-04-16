import { afterEach, describe, expect, it } from "vitest";
import { openAppDatabase, type OpenedAppDatabase } from "./database.js";

interface UsageHistoryStore {
  readonly recordClaudeUsageSnapshot: (input: {
    readonly accountId: string | null;
    readonly providerId?: string;
    readonly usage: ClaudeUsageFixture;
    readonly capturedAt?: string;
  }) => UsageSnapshotSummary;
  readonly listRecentSnapshots: (filters?: {
    readonly accountId?: string | null;
    readonly providerId?: string;
    readonly limit?: number;
  }) => readonly UsageSnapshotSummary[];
}

interface UsageSnapshotSummary {
  readonly id: string;
  readonly accountId: string | null;
  readonly providerId: string;
  readonly capturedAt: string;
  readonly sessionUtilization: number | null;
  readonly weeklyUtilization: number | null;
  readonly resetAt: string | null;
  readonly payload: ClaudeUsageFixture;
}

interface HistoryModule {
  readonly createUsageHistoryStore: (options: {
    readonly database: OpenedAppDatabase["database"];
    readonly idFactory?: () => string;
    readonly now?: () => string;
  }) => UsageHistoryStore;
}

interface ClaudeUsageFixture {
  readonly fiveHour: UsageLimitFixture;
  readonly sevenDay: UsageLimitFixture;
  readonly sevenDaySonnet: UsageLimitFixture | null;
  readonly sevenDayOpus: UsageLimitFixture | null;
  readonly sevenDayOauthApps: UsageLimitFixture | null;
  readonly sevenDayCowork: UsageLimitFixture | null;
  readonly other: UsageLimitFixture | null;
  readonly extraUsage: UsageLimitFixture | null;
}

interface UsageLimitFixture {
  readonly utilization: number;
  readonly resetsAt: string | null;
}

const historyModuleSpecifier = "./history.js";
let opened: OpenedAppDatabase | null = null;

describe("usage history storage contract", () => {
  afterEach(() => {
    opened?.close();
    opened = null;
  });

  it("records Claude snapshots with normalized metrics and raw payload JSON", async () => {
    const store = await createStore(["snapshot-1"]);
    insertAccount("account-1");

    const snapshot = store.recordClaudeUsageSnapshot({
      accountId: "account-1",
      usage: claudeUsageFixture(),
      capturedAt: "2026-04-15T12:00:00.000Z"
    });

    expect(snapshot).toEqual({
      id: "snapshot-1",
      accountId: "account-1",
      providerId: "claude",
      capturedAt: "2026-04-15T12:00:00.000Z",
      sessionUtilization: 0.42,
      weeklyUtilization: 0.62,
      resetAt: "2026-04-15T17:00:00.000Z",
      payload: claudeUsageFixture()
    });
    expect(JSON.stringify(snapshot)).not.toContain("sessionKey");

    const row = opened?.database
      .prepare(
        `
          SELECT session_utilization, weekly_utilization, reset_at, payload_json
          FROM usage_snapshots
          WHERE id = ?;
        `
      )
      .get("snapshot-1") as
      | {
          readonly session_utilization: number;
          readonly weekly_utilization: number;
          readonly reset_at: string;
          readonly payload_json: string;
        }
      | undefined;

    expect(row).toMatchObject({
      session_utilization: 0.42,
      weekly_utilization: 0.62,
      reset_at: "2026-04-15T17:00:00.000Z"
    });
    expect(JSON.parse(row?.payload_json ?? "{}")).toEqual(claudeUsageFixture());
  });

  it("lists recent snapshots by account and provider newest first with a limit", async () => {
    const store = await createStore(["snapshot-1", "snapshot-2", "snapshot-3"]);
    insertAccount("account-1");
    insertAccount("account-2");

    store.recordClaudeUsageSnapshot({
      accountId: "account-1",
      usage: claudeUsageFixture({ fiveHourUtilization: 0.2 }),
      capturedAt: "2026-04-15T11:00:00.000Z"
    });
    store.recordClaudeUsageSnapshot({
      accountId: "account-1",
      usage: claudeUsageFixture({ fiveHourUtilization: 0.7 }),
      capturedAt: "2026-04-15T12:00:00.000Z"
    });
    store.recordClaudeUsageSnapshot({
      accountId: "account-2",
      usage: claudeUsageFixture({ fiveHourUtilization: 0.9 }),
      capturedAt: "2026-04-15T12:30:00.000Z"
    });

    expect(store.listRecentSnapshots({ accountId: "account-1", providerId: "claude", limit: 1 })).toMatchObject([
      {
        id: "snapshot-2",
        accountId: "account-1",
        providerId: "claude",
        sessionUtilization: 0.7
      }
    ]);
  });

  it("keeps historical snapshots after account deletion by clearing the account id", async () => {
    const store = await createStore(["snapshot-1"]);
    insertAccount("account-1");
    store.recordClaudeUsageSnapshot({
      accountId: "account-1",
      usage: claudeUsageFixture(),
      capturedAt: "2026-04-15T12:00:00.000Z"
    });

    opened?.database.prepare("DELETE FROM accounts WHERE id = ?;").run("account-1");

    expect(store.listRecentSnapshots({ providerId: "claude" })).toMatchObject([
      {
        id: "snapshot-1",
        accountId: null
      }
    ]);
  });
});

async function createStore(ids: readonly string[] = []): Promise<UsageHistoryStore> {
  opened = openAppDatabase({ inMemory: true });
  const { createUsageHistoryStore } = await loadHistoryModule();
  const queue = [...ids];
  return createUsageHistoryStore({
    database: opened.database,
    idFactory: () => queue.shift() ?? `generated-${queue.length}`,
    now: () => "2026-04-15T12:00:00.000Z"
  });
}

async function loadHistoryModule(): Promise<HistoryModule> {
  return import(historyModuleSpecifier) as Promise<HistoryModule>;
}

function insertAccount(accountId: string): void {
  opened?.database
    .prepare(
      `
        INSERT INTO accounts (id, label, org_id, is_active, auth_status, created_at, updated_at)
        VALUES (?, ?, ?, 0, 'configured', ?, ?);
      `
    )
    .run(accountId, accountId, `org_${accountId}`, "2026-04-15T12:00:00.000Z", "2026-04-15T12:00:00.000Z");
}

function claudeUsageFixture(
  options: { readonly fiveHourUtilization?: number; readonly weeklyUtilization?: number } = {}
): ClaudeUsageFixture {
  return {
    fiveHour: {
      utilization: options.fiveHourUtilization ?? 0.42,
      resetsAt: "2026-04-15T17:00:00.000Z"
    },
    sevenDay: {
      utilization: options.weeklyUtilization ?? 0.62,
      resetsAt: "2026-04-22T00:00:00.000Z"
    },
    sevenDaySonnet: null,
    sevenDayOpus: {
      utilization: 0.51,
      resetsAt: "2026-04-22T00:00:00.000Z"
    },
    sevenDayOauthApps: null,
    sevenDayCowork: null,
    other: null,
    extraUsage: null
  };
}
