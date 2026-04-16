import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openAppDatabase, type OpenedAppDatabase } from "../storage/database.js";
import type { SecretEnvelope } from "../storage/secrets.js";

const electronMock = vi.hoisted(() => ({
  app: {
    getPath: vi.fn(() => "/tmp/claude-usage-review-test")
  },
  safeStorage: {
    decryptString: vi.fn(),
    encryptString: vi.fn(),
    getSelectedStorageBackend: vi.fn(() => "gnome_libsecret"),
    isEncryptionAvailable: vi.fn(() => true)
  }
}));

vi.mock("electron", () => electronMock);

let opened: OpenedAppDatabase | null = null;

describe("Claude usage main-process integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T12:00:00.000Z"));
  });

  afterEach(() => {
    opened?.close();
    opened = null;
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("fetches Claude usage from secret-backed credentials, records history, and emits secret-free state", async () => {
    const { createAccountStore } = await import("../storage/accounts.js");
    const { createClaudeCredentialStore } = await import("../storage/secrets.js");
    const { createUsageHistoryStore } = await import("../storage/history.js");
    const { createClaudeUsageClient } = await import("./claudeUsage.js");
    const { createUsagePollingScheduler } = await import("./polling.js");

    opened = openAppDatabase({ inMemory: true });
    const accountStore = createAccountStore({
      database: opened.database,
      idFactory: () => "account-1",
      now: () => "2026-04-15T11:55:00.000Z"
    });
    const credentialStore = createClaudeCredentialStore({
      persistence: new MemoryCredentialPersistence(),
      platform: "linux",
      safeStorage: createFakeSafeStorage()
    });
    const historyStore = createUsageHistoryStore({
      database: opened.database,
      idFactory: () => "snapshot-1"
    });

    const account = accountStore.addAccount({ label: "Work", orgId: "org_123" });
    accountStore.setAuthStatus(account.id, "configured");
    credentialStore.writeClaudeSessionKey(account.id, "sk-ant-sid01-original");

    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        Cookie: "sessionKey=sk-ant-sid01-original",
        "anthropic-client-platform": "web_claude_ai"
      });

      return new Response(JSON.stringify(claudeUsagePayload()), {
        headers: {
          "set-cookie": "sessionKey=sk-ant-sid01-rotated; Path=/; HttpOnly"
        },
        status: 200
      });
    });
    const emittedStates: unknown[] = [];
    const claudeClient = createClaudeUsageClient({ fetch: fetchMock as typeof fetch });
    const scheduler = createUsagePollingScheduler({
      accountStore: {
        getActiveClaudeCredentials: () => {
          const activeAccount = accountStore.getActiveAccount();
          if (!activeAccount?.orgId) {
            return null;
          }

          const sessionKey = credentialStore.readClaudeSessionKey(activeAccount.id);
          if (!sessionKey) {
            return null;
          }

          return {
            accountId: activeAccount.id,
            orgId: activeAccount.orgId,
            sessionKey
          };
        },
        markAuthExpired: (accountId) => {
          accountStore.setAuthStatus(accountId, "expired");
        }
      },
      claudeClient,
      emitUsageUpdated: (state) => {
        emittedStates.push(state);
      },
      recordUsageSnapshot: (snapshot) => {
        historyStore.recordClaudeUsageSnapshot({
          accountId: snapshot.accountId,
          capturedAt: snapshot.capturedAt,
          usage: snapshot.usage
        });
      },
      saveRotatedSessionKey: (accountId, sessionKey) => {
        credentialStore.writeClaudeSessionKey(accountId, sessionKey);
      },
      now: () => Date.now()
    });

    scheduler.start(account.id);
    await vi.runOnlyPendingTimersAsync();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(credentialStore.readClaudeSessionKey(account.id)).toBe("sk-ant-sid01-rotated");
    expect(historyStore.listRecentSnapshots({ accountId: account.id, providerId: "claude" })).toMatchObject([
      {
        id: "snapshot-1",
        accountId: account.id,
        capturedAt: "2026-04-15T12:00:00.000Z",
        sessionUtilization: 0.42,
        weeklyUtilization: 0.62,
        resetAt: "2026-04-15T17:00:00.000Z"
      }
    ]);
    expect(emittedStates).toContainEqual(
      expect.objectContaining({
        accountId: account.id,
        lastUpdatedAt: "2026-04-15T12:00:00.000Z",
        status: "updated",
        usage: expect.objectContaining({
          fiveHour: {
            resetsAt: "2026-04-15T17:00:00.000Z",
            utilization: 0.42
          }
        })
      })
    );
    expect(JSON.stringify(emittedStates)).not.toContain("sk-ant-sid01");
    expect(JSON.stringify(historyStore.listRecentSnapshots())).not.toContain("sk-ant-sid01");
  });
});

function createFakeSafeStorage() {
  return {
    decryptString: vi.fn((buffer: Buffer) => buffer.toString("utf8").replace(/^encrypted:/u, "")),
    encryptString: vi.fn((value: string) => Buffer.from(`encrypted:${value}`, "utf8")),
    getSelectedStorageBackend: vi.fn(() => "gnome_libsecret" as const),
    isEncryptionAvailable: vi.fn(() => true)
  };
}

class MemoryCredentialPersistence {
  private readonly values = new Map<string, SecretEnvelope>();

  delete(key: string): void {
    this.values.delete(key);
  }

  read(key: string): SecretEnvelope | null {
    return this.values.get(key) ?? null;
  }

  write(key: string, envelope: SecretEnvelope): void {
    this.values.set(key, envelope);
  }
}

function claudeUsagePayload(): Record<string, unknown> {
  return {
    five_hour: {
      utilization: 0.42,
      resets_at: "2026-04-15T17:00:00.000Z"
    },
    seven_day: {
      utilization: 0.62,
      resets_at: "2026-04-22T00:00:00.000Z"
    },
    seven_day_sonnet: null,
    seven_day_opus: {
      utilization: 0.51,
      resets_at: "2026-04-22T00:00:00.000Z"
    },
    seven_day_oauth_apps: null,
    seven_day_cowork: null,
    extra_usage: null
  };
}
