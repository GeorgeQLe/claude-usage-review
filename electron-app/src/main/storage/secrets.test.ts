import { describe, expect, it, vi } from "vitest";

const electronMock = vi.hoisted(() => ({
  safeStorage: {
    decryptString: vi.fn(),
    encryptString: vi.fn(),
    getSelectedStorageBackend: vi.fn(() => "gnome_libsecret"),
    isEncryptionAvailable: vi.fn(() => true)
  }
}));

vi.mock("electron", () => electronMock);

interface SecretEnvelope {
  readonly version: 1;
  readonly encryptedBase64: string;
}

interface ClaudeCredentialStore {
  readonly writeClaudeSessionKey: (accountId: string, sessionKey: string) => void;
  readonly readClaudeSessionKey: (accountId: string) => string | null;
  readonly deleteClaudeSessionKey: (accountId: string) => void;
  readonly getCredentialStatus: (accountId: string) => {
    readonly hasClaudeSessionKey: boolean;
    readonly storageWarning: string | null;
  };
}

interface SecretsModule {
  readonly createClaudeCredentialStore: (options: {
    readonly safeStorage: SafeStorageAdapter;
    readonly persistence: CredentialPersistence;
    readonly platform?: NodeJS.Platform;
  }) => ClaudeCredentialStore;
}

interface SafeStorageAdapter {
  readonly decryptString: (buffer: Buffer) => string;
  readonly encryptString: (value: string) => Buffer;
  readonly getSelectedStorageBackend: () => string;
  readonly isEncryptionAvailable: () => boolean;
}

interface CredentialPersistence {
  readonly delete: (key: string) => void;
  readonly read: (key: string) => SecretEnvelope | null;
  readonly write: (key: string, envelope: SecretEnvelope) => void;
}

const secretsModuleSpecifier = "./secrets.js";

describe("Claude credential secret storage contract", () => {
  it("writes, reads, and deletes account-scoped encrypted Claude session keys", async () => {
    const persistence = new MemoryCredentialPersistence();
    const storage = createFakeSafeStorage();
    const { createClaudeCredentialStore } = await loadSecretsModule();
    const store = createClaudeCredentialStore({
      persistence,
      safeStorage: storage,
      platform: "linux"
    });

    store.writeClaudeSessionKey("account-1", "sk-ant-sid01-secret");

    expect(persistence.snapshot()).toEqual({
      "account-1:claude:sessionKey": {
        version: 1,
        encryptedBase64: Buffer.from("encrypted:sk-ant-sid01-secret", "utf8").toString("base64")
      }
    });
    expect(JSON.stringify(persistence.snapshot())).not.toContain("sk-ant-sid01-secret");
    expect(store.readClaudeSessionKey("account-1")).toBe("sk-ant-sid01-secret");

    store.deleteClaudeSessionKey("account-1");

    expect(store.readClaudeSessionKey("account-1")).toBeNull();
  });

  it("reports weak Linux safeStorage backend status without exposing decrypted values", async () => {
    const persistence = new MemoryCredentialPersistence();
    const { createClaudeCredentialStore } = await loadSecretsModule();
    const store = createClaudeCredentialStore({
      persistence,
      platform: "linux",
      safeStorage: createFakeSafeStorage({ backend: "basic_text" })
    });

    store.writeClaudeSessionKey("account-1", "sk-ant-sid01-secret");

    expect(store.getCredentialStatus("account-1")).toEqual({
      hasClaudeSessionKey: true,
      storageWarning:
        "Electron safeStorage is using the Linux basic_text backend. Secrets are stored with weaker local protection on this desktop session."
    });
    expect(JSON.stringify(store.getCredentialStatus("account-1"))).not.toContain("sk-ant-sid01-secret");
  });
});

async function loadSecretsModule(): Promise<SecretsModule> {
  return import(secretsModuleSpecifier) as Promise<SecretsModule>;
}

function createFakeSafeStorage(options: { readonly available?: boolean; readonly backend?: string } = {}): SafeStorageAdapter {
  const available = options.available ?? true;
  const backend = options.backend ?? "gnome_libsecret";

  return {
    decryptString: vi.fn((buffer: Buffer) => buffer.toString("utf8").replace(/^encrypted:/u, "")),
    encryptString: vi.fn((value: string) => Buffer.from(`encrypted:${value}`, "utf8")),
    getSelectedStorageBackend: vi.fn(() => backend),
    isEncryptionAvailable: vi.fn(() => available)
  };
}

class MemoryCredentialPersistence implements CredentialPersistence {
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

  snapshot(): Record<string, SecretEnvelope> {
    return Object.fromEntries(this.values);
  }
}
