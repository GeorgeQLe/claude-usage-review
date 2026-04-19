import { afterEach, describe, expect, it, vi } from "vitest";

const electronMock = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown, payload?: unknown) => unknown>();
  const windows: Array<{ readonly webContents: { readonly send: ReturnType<typeof vi.fn> } }> = [];

  return {
    BrowserWindow: {
      getAllWindows: vi.fn(() => windows)
    },
    __handlers: handlers,
    __windows: windows,
    ipcMain: {
      handle: vi.fn((channel: string, handler: (event: unknown, payload?: unknown) => unknown) => {
        handlers.set(channel, handler);
      }),
      removeHandler: vi.fn((channel: string) => {
        handlers.delete(channel);
      })
    },
    safeStorage: {
      decryptString: vi.fn(),
      encryptString: vi.fn(),
      getSelectedStorageBackend: vi.fn(() => "gnome_libsecret"),
      isEncryptionAvailable: vi.fn(() => true)
    }
  };
});

vi.mock("electron", () => electronMock);

describe("Phase 2 IPC command contract", () => {
  afterEach(() => {
    electronMock.__handlers.clear();
    electronMock.__windows.length = 0;
    vi.clearAllMocks();
  });

  it("wires account commands to durable account and credential services", async () => {
    const { ipcChannelNames, registerIpcHandlers } = await import("./ipc.js");
    const accounts = {
      addAccount: vi.fn(() => [{ id: "account-1", label: "Work", orgId: null, isActive: true, authStatus: "missing_credentials" }]),
      renameAccount: vi.fn(),
      removeAccount: vi.fn(),
      setActiveAccount: vi.fn()
    };
    const credentials = {
      writeClaudeSessionKey: vi.fn()
    };

    (registerIpcHandlers as (dependencies: unknown) => unknown)({ accounts, credentials });

    await invoke(ipcChannelNames.addAccount, { label: "Work" });
    await invoke(ipcChannelNames.saveClaudeCredentials, {
      accountId: "account-2",
      orgId: "org_123",
      sessionKey: "sk-ant-sid01-secret"
    });

    expect(accounts.addAccount).toHaveBeenCalledWith({ label: "Work" });
    expect(credentials.writeClaudeSessionKey).toHaveBeenCalledWith("account-2", "sk-ant-sid01-secret");
  });

  it("rejects malformed typed IPC payloads before mutating state", async () => {
    const { ipcChannelNames, registerIpcHandlers } = await import("./ipc.js");

    registerIpcHandlers();

    await expect(invoke(ipcChannelNames.saveClaudeCredentials, { accountId: "", orgId: "", sessionKey: "" })).rejects.toThrow();
    await expect(invoke(ipcChannelNames.renameAccount, { accountId: "account-1", label: "" })).rejects.toThrow();
  });

  it("tests Claude connections through the usage client and never returns session keys", async () => {
    const { ipcChannelNames, registerIpcHandlers } = await import("./ipc.js");
    const claudeClient = {
      fetchUsage: vi.fn(async () => ({ data: {}, rotatedSessionKey: "sk-ant-sid01-rotated" }))
    };

    (registerIpcHandlers as (dependencies: unknown) => unknown)({ claudeClient });

    const result = await invoke(ipcChannelNames.testClaudeConnection, {
      orgId: "org_123",
      sessionKey: "sk-ant-sid01-secret"
    });

    expect(claudeClient.fetchUsage).toHaveBeenCalledWith({
      orgId: "org_123",
      sessionKey: "sk-ant-sid01-secret"
    });
    expect(result).toEqual({
      ok: true,
      status: "connected",
      message: "Claude connection succeeded."
    });
    expect(JSON.stringify(result)).not.toContain("sk-ant-sid01");
  });

  it("broadcasts sanitized usage-updated events to renderer windows after refresh", async () => {
    const { ipcChannelNames, registerIpcHandlers } = await import("./ipc.js");
    const send = vi.fn();
    electronMock.__windows.push({ webContents: { send } });

    registerIpcHandlers();

    const state = await invoke(ipcChannelNames.refreshNow);

    expect(send).toHaveBeenCalledWith(ipcChannelNames.usageUpdated, state);
    expect(JSON.stringify(state)).not.toContain("sessionKey");
    expect(JSON.stringify(state)).not.toContain("sk-ant");
  });

  it("routes sanitized refresh results to local notification evaluation", async () => {
    const { ipcChannelNames, registerIpcHandlers } = await import("./ipc.js");
    const evaluateUsageState = vi.fn();

    registerIpcHandlers({
      notifications: {
        evaluateUsageState
      }
    });

    const state = await invoke(ipcChannelNames.refreshNow);

    expect(evaluateUsageState).toHaveBeenCalledWith(state);
    expect(JSON.stringify(evaluateUsageState.mock.calls)).not.toContain("sessionKey");
    expect(JSON.stringify(evaluateUsageState.mock.calls)).not.toContain("sk-ant");
  });

  it("routes provider diagnostics and refresh actions through sanitized provider dependencies", async () => {
    const { ipcChannelNames, registerIpcHandlers } = await import("./ipc.js");
    const providers = {
      getDiagnostics: vi.fn(() => ({
        providerId: "codex",
        status: "degraded",
        messages: ["history.jsonl parsed with one malformed line"],
        lastCheckedAt: "2026-04-17T15:00:00.000Z"
      })),
      refreshProvider: vi.fn(() => ({
        detected: true,
        providerId: "gemini",
        confidence: "estimated",
        message: "Gemini passive session state refreshed."
      }))
    };

    (registerIpcHandlers as (dependencies: unknown) => unknown)({ providers });

    const diagnostics = await invoke(ipcChannelNames.getProviderDiagnostics, { providerId: "codex" });
    const refreshed = await invoke(ipcChannelNames.runProviderDetection, { providerId: "gemini" });

    expect(providers.getDiagnostics).toHaveBeenCalledWith("codex");
    expect(providers.refreshProvider).toHaveBeenCalledWith("gemini");
    expect(diagnostics).toMatchObject({
      providerId: "codex",
      status: "degraded"
    });
    expect(refreshed).toMatchObject({
      confidence: "estimated",
      detected: true,
      providerId: "gemini"
    });
    expect(JSON.stringify({ diagnostics, refreshed })).not.toContain("access_token");
    expect(JSON.stringify({ diagnostics, refreshed })).not.toContain("prompt");
  });

  it("routes wrapper generation and verification through sanitized wrapper dependencies", async () => {
    const { ipcChannelNames, registerIpcHandlers } = await import("./ipc.js");
    const wrappers = {
      generateWrapper: vi.fn(() => ({
        command: "export PATH='/tmp/ClaudeUsage/wrappers/codex':$PATH",
        instructions: ["Run the command manually in your shell."],
        mutatesShellProfiles: false,
        providerId: "codex",
        removalInstructions: ["Remove /tmp/ClaudeUsage/wrappers/codex from PATH."],
        setupCommands: ["export PATH='/tmp/ClaudeUsage/wrappers/codex':$PATH"],
        verified: false,
        wrapperPath: "/tmp/ClaudeUsage/wrappers/codex/codex"
      })),
      verifyWrapper: vi.fn(() => ({
        message: "Codex wrapper is active.",
        providerId: "codex",
        status: "wrapper_active",
        verified: true,
        wrapperVersion: "5.0.0"
      }))
    };

    (registerIpcHandlers as (dependencies: unknown) => unknown)({ wrappers });

    const setup = await invoke(ipcChannelNames.generateWrapper, { providerId: "codex" });
    const verification = await invoke(ipcChannelNames.verifyWrapper, { providerId: "codex" });

    expect(wrappers.generateWrapper).toHaveBeenCalledWith("codex");
    expect(wrappers.verifyWrapper).toHaveBeenCalledWith("codex");
    expect(setup).toMatchObject({
      mutatesShellProfiles: false,
      providerId: "codex",
      setupCommands: ["export PATH='/tmp/ClaudeUsage/wrappers/codex':$PATH"]
    });
    expect(verification).toMatchObject({
      providerId: "codex",
      status: "wrapper_active",
      verified: true
    });
    expect(JSON.stringify({ setup, verification })).not.toMatch(/prompt|stdout|raw stderr|access[_-]?token|session[_-]?key|cookie/iu);
  });

  it("routes migration scan, import, and record reads through sanitized migration dependencies", async () => {
    const { ipcChannelNames, registerIpcHandlers } = await import("./ipc.js");
    const migration = {
      scanSources: vi.fn(() => ({
        scannedAt: "2026-04-17T15:00:00.000Z",
        candidates: [
          {
            candidateId: "swift-1",
            displayName: "Swift ClaudeUsage app",
            error: null,
            metadataCounts: {
              accounts: 1,
              appSettings: 1,
              historySnapshots: 2,
              providerSettings: 1
            },
            skippedSecretCategories: ["claude-session-key", "github-token"],
            sourceKind: "swift",
            status: "ready",
            warnings: ["Provider token was skipped."]
          }
        ]
      })),
      runImport: vi.fn((candidateId: string) => ({
        displayName: "Swift ClaudeUsage app",
        failures: [],
        importedAt: "2026-04-17T15:01:00.000Z",
        metadataCounts: {
          accounts: 1,
          appSettings: 1,
          historySnapshots: 2,
          providerSettings: 1
        },
        record: {
          displayName: "Swift ClaudeUsage app",
          failures: [],
          id: `migration-${candidateId}`,
          importedAt: "2026-04-17T15:01:00.000Z",
          metadataCounts: {
            accounts: 1,
            appSettings: 1,
            historySnapshots: 2,
            providerSettings: 1
          },
          skippedSecretCategories: ["claude-session-key", "github-token"],
          sourceKind: "swift",
          status: "imported",
          warnings: []
        },
        skippedSecretCategories: ["claude-session-key", "github-token"],
        sourceKind: "swift",
        status: "imported",
        warnings: []
      })),
      listRecords: vi.fn(() => ({
        generatedAt: "2026-04-17T15:02:00.000Z",
        records: []
      }))
    };

    (registerIpcHandlers as (dependencies: unknown) => unknown)({ migration });

    const scan = await invoke(ipcChannelNames.scanMigrationSources);
    const imported = await invoke(ipcChannelNames.runMigrationImport, { candidateId: "swift-1" });
    const records = await invoke(ipcChannelNames.getMigrationRecords);

    expect(migration.scanSources).toHaveBeenCalled();
    expect(migration.runImport).toHaveBeenCalledWith("swift-1");
    expect(migration.listRecords).toHaveBeenCalled();
    expect(scan).toMatchObject({
      candidates: [
        {
          candidateId: "swift-1",
          sourceKind: "swift"
        }
      ]
    });
    expect(imported).toMatchObject({
      displayName: "Swift ClaudeUsage app",
      status: "imported"
    });
    expect(records).toMatchObject({
      records: []
    });
    expect(JSON.stringify({ scan, imported, records })).not.toMatch(
      /\/Users\/|config\.json|sk-ant|ghp_|access[_-]?token|cookie|raw provider prompt/iu
    );
  });

  it("exports derived provider diagnostics placeholders without raw provider content", async () => {
    const { ipcChannelNames, registerIpcHandlers } = await import("./ipc.js");

    registerIpcHandlers({
      usageState: {
        getUsageState: () => ({
          activeProviderId: "gemini",
          lastUpdatedAt: "2026-04-17T15:00:00.000Z",
          providers: [
            {
              actions: ["refresh", "diagnostics"],
              adapterMode: "passive",
              confidence: "estimated",
              confidenceExplanation: "Estimated from local Codex activity.",
              dailyRequestCount: 12,
              detailText: "history.jsonl bookmark offset 128.",
              displayName: "Codex",
              enabled: true,
              headline: "Codex activity observed",
              lastUpdatedAt: "2026-04-17T14:59:00.000Z",
              providerId: "codex",
              requestsPerMinute: null,
              resetAt: null,
              sessionUtilization: null,
              status: "configured",
              weeklyUtilization: null
            },
            {
              actions: ["refresh", "diagnostics"],
              adapterMode: "accuracy",
              confidence: "high_confidence",
              confidenceExplanation: "High confidence from Gemini /stats.",
              dailyRequestCount: 42,
              detailText: "Gemini /stats summary parsed.",
              displayName: "Gemini",
              enabled: true,
              headline: "Gemini request window is healthy",
              lastUpdatedAt: "2026-04-17T15:00:00.000Z",
              providerId: "gemini",
              requestsPerMinute: 2,
              resetAt: null,
              sessionUtilization: null,
              status: "configured",
              weeklyUtilization: null
            }
          ],
          warning: null
        })
      }
    });

    const diagnostics = await invoke(ipcChannelNames.exportDiagnostics);

    expect(diagnostics).toMatchObject({
      summary: "Provider diagnostics export contains derived status only."
    });
    expect(JSON.stringify(diagnostics)).toContain("Codex: configured, estimated");
    expect(JSON.stringify(diagnostics)).toContain("Gemini: configured, high_confidence");
    expect(JSON.stringify(diagnostics)).toContain("bookmark offset 128");
    expect(JSON.stringify(diagnostics)).not.toContain("access_token");
    expect(JSON.stringify(diagnostics)).not.toContain("prompt");
    expect(JSON.stringify(diagnostics)).not.toContain("raw chat");
  });

  it("redacts unsafe terms from Accuracy Mode diagnostics export entries", async () => {
    const { ipcChannelNames, registerIpcHandlers } = await import("./ipc.js");

    registerIpcHandlers({
      usageState: {
        getUsageState: () => ({
          activeProviderId: "codex",
          lastUpdatedAt: "2026-04-17T15:00:00.000Z",
          providers: [
            {
              actions: ["refresh", "diagnostics"],
              adapterMode: "accuracy",
              confidence: "high_confidence",
              confidenceExplanation: "High confidence from prompt and access_token signals.",
              dailyRequestCount: 3,
              detailText: "raw chat and cookie metadata must not leave diagnostics.",
              displayName: "Codex",
              enabled: true,
              headline: "Codex wrapper observed session_key state",
              lastUpdatedAt: "2026-04-17T14:59:00.000Z",
              providerId: "codex",
              requestsPerMinute: 1,
              resetAt: null,
              sessionUtilization: null,
              status: "configured",
              weeklyUtilization: null
            }
          ],
          warning: null
        })
      }
    });

    const diagnostics = await invoke(ipcChannelNames.exportDiagnostics);
    const serialized = JSON.stringify(diagnostics);

    expect(serialized).toContain("Accuracy Mode");
    expect(serialized).toContain("redacted");
    expect(serialized).not.toMatch(/prompt|access[_-]?token|raw chat|cookie|session[_-]?key/iu);
  });
});

async function invoke(channel: string, payload?: unknown): Promise<unknown> {
  const handler = electronMock.__handlers.get(channel);
  if (!handler) {
    throw new Error(`Missing IPC handler for ${channel}`);
  }

  return handler({}, payload);
}
