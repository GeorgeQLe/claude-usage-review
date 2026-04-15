import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface PollingScheduler {
  readonly start: (accountId: string) => void;
  readonly refreshNow: () => Promise<void>;
  readonly switchAccount: (accountId: string) => void;
  readonly stop: () => void;
}

interface PollingModule {
  readonly createUsagePollingScheduler: (options: {
    readonly accountStore: AccountStoreStub;
  readonly claudeClient: ClaudeClientStub;
  readonly emitUsageUpdated: (state: unknown) => void;
  readonly saveRotatedSessionKey: (accountId: string, sessionKey: string) => void;
  readonly now?: () => number;
}) => PollingScheduler;
}

interface AccountStoreStub {
  readonly getActiveClaudeCredentials: () => { readonly accountId: string; readonly orgId: string; readonly sessionKey: string } | null;
  readonly markAuthExpired: (accountId: string) => void;
}

interface ClaudeClientStub {
  readonly fetchUsage: (credentials: { readonly orgId: string; readonly sessionKey: string }) => Promise<{
    readonly data: { readonly fiveHour: { readonly utilization: number; readonly resetsAt: string | null } };
    readonly rotatedSessionKey: string | null;
  }>;
}

type PollingFetchResult = Awaited<ReturnType<ClaudeClientStub["fetchUsage"]>>;
type FetchThunk = () => Promise<PollingFetchResult>;

const pollingModuleSpecifier = "./polling.js";

describe("Claude usage polling scheduler contract", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls immediately and then every five minutes by default", async () => {
    const services = createPollingServices();
    const { createUsagePollingScheduler } = await loadPollingModule();
    const scheduler = createUsagePollingScheduler(services);

    scheduler.start("account-1");
    await vi.runOnlyPendingTimersAsync();

    expect(services.claudeClient.fetchUsage).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(299_999);
    expect(services.claudeClient.fetchUsage).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(services.claudeClient.fetchUsage).toHaveBeenCalledTimes(2);
  });

  it("backs off exponentially after network errors and resets cadence after success", async () => {
    const services = createPollingServices({
      fetchResults: [
        () => Promise.reject<PollingFetchResult>({ kind: "network_error" }),
        () => Promise.reject<PollingFetchResult>({ kind: "network_error" }),
        () => Promise.resolve(successfulUsage())
      ]
    });
    const { createUsagePollingScheduler } = await loadPollingModule();
    const scheduler = createUsagePollingScheduler(services);

    scheduler.start("account-1");
    await vi.runOnlyPendingTimersAsync();

    await vi.advanceTimersByTimeAsync(600_000);
    expect(services.claudeClient.fetchUsage).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1_200_000);
    expect(services.claudeClient.fetchUsage).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(300_000);
    expect(services.claudeClient.fetchUsage).toHaveBeenCalledTimes(4);
  });

  it("schedules a reset-time fetch, supports manual refresh, and saves rotated session keys", async () => {
    const services = createPollingServices({
      fetchResults: [
        () => Promise.resolve(successfulUsage({ resetsAt: "2026-04-15T12:02:00.000Z", rotatedSessionKey: "rotated" })),
        () => Promise.resolve(successfulUsage())
      ]
    });
    const { createUsagePollingScheduler } = await loadPollingModule();
    const scheduler = createUsagePollingScheduler(services);

    scheduler.start("account-1");
    await vi.runOnlyPendingTimersAsync();

    expect(services.saveRotatedSessionKey).toHaveBeenCalledWith("account-1", "rotated");

    await vi.advanceTimersByTimeAsync(120_000);
    expect(services.claudeClient.fetchUsage).toHaveBeenCalledTimes(2);

    await scheduler.refreshNow();
    expect(services.claudeClient.fetchUsage).toHaveBeenCalledTimes(3);
  });

  it("cancels old account work on account switch and stops after auth expiry", async () => {
    const services = createPollingServices({
      fetchResults: [() => Promise.reject<PollingFetchResult>({ kind: "auth_expired", statusCode: 403 })]
    });
    const { createUsagePollingScheduler } = await loadPollingModule();
    const scheduler = createUsagePollingScheduler(services);

    scheduler.start("account-1");
    scheduler.switchAccount("account-2");
    await vi.runOnlyPendingTimersAsync();

    expect(services.accountStore.markAuthExpired).toHaveBeenCalledWith("account-2");

    await vi.advanceTimersByTimeAsync(600_000);
    expect(services.claudeClient.fetchUsage).toHaveBeenCalledTimes(1);
  });
});

async function loadPollingModule(): Promise<PollingModule> {
  return import(pollingModuleSpecifier) as Promise<PollingModule>;
}

function createPollingServices(options: { readonly fetchResults?: ReadonlyArray<FetchThunk> } = {}) {
  const queue = [...(options.fetchResults ?? [() => Promise.resolve(successfulUsage())])];
  const active = {
    accountId: "account-1",
    orgId: "org_123",
    sessionKey: "sk-ant-sid01-current"
  };

  return {
    accountStore: {
      getActiveClaudeCredentials: vi.fn(() => active),
      markAuthExpired: vi.fn()
    },
    claudeClient: {
      fetchUsage: vi.fn(() => (queue.shift() ?? (() => Promise.resolve(successfulUsage())))())
    },
    emitUsageUpdated: vi.fn(),
    saveRotatedSessionKey: vi.fn(),
    now: () => Date.now()
  } satisfies {
    accountStore: AccountStoreStub;
    claudeClient: ClaudeClientStub;
    emitUsageUpdated: (state: unknown) => void;
    saveRotatedSessionKey: (accountId: string, sessionKey: string) => void;
    now: () => number;
  };
}

function successfulUsage(options: { readonly resetsAt?: string | null; readonly rotatedSessionKey?: string | null } = {}) {
  return {
    data: {
      fiveHour: {
        utilization: 0.42,
        resetsAt: options.resetsAt ?? null
      }
    },
    rotatedSessionKey: options.rotatedSessionKey ?? null
  };
}
