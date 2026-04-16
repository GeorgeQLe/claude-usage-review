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
});

async function invoke(channel: string, payload?: unknown): Promise<unknown> {
  const handler = electronMock.__handlers.get(channel);
  if (!handler) {
    throw new Error(`Missing IPC handler for ${channel}`);
  }

  return handler({}, payload);
}
