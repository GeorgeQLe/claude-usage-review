import { safeStorage, type SafeStorage } from "electron";

export type SafeStorageBackend = ReturnType<SafeStorage["getSelectedStorageBackend"]>;

export interface SafeStorageAdapter {
  readonly decryptString: (encrypted: Buffer) => string;
  readonly encryptString: (plainText: string) => Buffer;
  readonly getSelectedStorageBackend: () => SafeStorageBackend;
  readonly isEncryptionAvailable: () => boolean;
}

export interface SecretEnvelope {
  readonly version: 1;
  readonly encryptedBase64: string;
}

export interface SecretStorageStatus {
  readonly available: boolean;
  readonly backend: SafeStorageBackend | null;
  readonly warning: string | null;
}

export interface SecretStore {
  readonly getStatus: () => SecretStorageStatus;
  readonly encryptSecret: (plainText: string) => SecretEnvelope;
  readonly decryptSecret: (envelope: SecretEnvelope) => string;
  readonly clearSecret: () => null;
}

export interface CredentialPersistence {
  readonly delete: (key: string) => void;
  readonly read: (key: string) => SecretEnvelope | null;
  readonly write: (key: string, envelope: SecretEnvelope) => void;
}

export interface ClaudeCredentialStatus {
  readonly hasClaudeSessionKey: boolean;
  readonly storageWarning: string | null;
}

export interface GitHubCredentialStatus {
  readonly hasGitHubToken: boolean;
  readonly storageWarning: string | null;
}

export interface ClaudeCredentialStore {
  readonly writeClaudeSessionKey: (accountId: string, sessionKey: string) => void;
  readonly readClaudeSessionKey: (accountId: string) => string | null;
  readonly deleteClaudeSessionKey: (accountId: string) => void;
  readonly getCredentialStatus: (accountId: string) => ClaudeCredentialStatus;
}

export interface GitHubCredentialStore {
  readonly writeGitHubToken: (token: string) => void;
  readonly readGitHubToken: () => string | null;
  readonly deleteGitHubToken: () => void;
  readonly getCredentialStatus: () => GitHubCredentialStatus;
}

export interface ClaudeCredentialStoreOptions {
  readonly safeStorage?: SafeStorageAdapter;
  readonly persistence: CredentialPersistence;
  readonly platform?: NodeJS.Platform;
}

export function createSecretStore(
  storage: SafeStorageAdapter = safeStorage,
  platform: NodeJS.Platform = process.platform
): SecretStore {
  return {
    getStatus: () => getSecretStorageStatus(storage, platform),
    encryptSecret: (plainText: string): SecretEnvelope => {
      assertEncryptionAvailable(storage);
      return {
        version: 1,
        encryptedBase64: storage.encryptString(plainText).toString("base64")
      };
    },
    decryptSecret: (envelope: SecretEnvelope): string => {
      assertEncryptionAvailable(storage);
      return storage.decryptString(Buffer.from(envelope.encryptedBase64, "base64"));
    },
    clearSecret: () => null
  };
}

export function createClaudeCredentialStore(options: ClaudeCredentialStoreOptions): ClaudeCredentialStore {
  const secretStore = createSecretStore(options.safeStorage, options.platform);

  return {
    writeClaudeSessionKey: (accountId: string, sessionKey: string): void => {
      options.persistence.write(getClaudeSessionKeyPersistenceKey(accountId), secretStore.encryptSecret(sessionKey));
    },
    readClaudeSessionKey: (accountId: string): string | null => {
      const envelope = options.persistence.read(getClaudeSessionKeyPersistenceKey(accountId));
      return envelope ? secretStore.decryptSecret(envelope) : null;
    },
    deleteClaudeSessionKey: (accountId: string): void => {
      options.persistence.delete(getClaudeSessionKeyPersistenceKey(accountId));
    },
    getCredentialStatus: (accountId: string): ClaudeCredentialStatus => ({
      hasClaudeSessionKey: options.persistence.read(getClaudeSessionKeyPersistenceKey(accountId)) !== null,
      storageWarning: secretStore.getStatus().warning
    })
  };
}

export function createGitHubCredentialStore(options: ClaudeCredentialStoreOptions): GitHubCredentialStore {
  const secretStore = createSecretStore(options.safeStorage, options.platform);

  return {
    writeGitHubToken: (token: string): void => {
      options.persistence.write(getGitHubTokenPersistenceKey(), secretStore.encryptSecret(token));
    },
    readGitHubToken: (): string | null => {
      const envelope = options.persistence.read(getGitHubTokenPersistenceKey());
      return envelope ? secretStore.decryptSecret(envelope) : null;
    },
    deleteGitHubToken: (): void => {
      options.persistence.delete(getGitHubTokenPersistenceKey());
    },
    getCredentialStatus: (): GitHubCredentialStatus => ({
      hasGitHubToken: options.persistence.read(getGitHubTokenPersistenceKey()) !== null,
      storageWarning: secretStore.getStatus().warning
    })
  };
}

export function getSecretStorageStatus(
  storage: SafeStorageAdapter = safeStorage,
  platform: NodeJS.Platform = process.platform
): SecretStorageStatus {
  const available = storage.isEncryptionAvailable();
  const backend = getSelectedStorageBackend(storage, platform);
  const warning =
    platform === "linux" && backend === "basic_text"
      ? "Electron safeStorage is using the Linux basic_text backend. Secrets are stored with weaker local protection on this desktop session."
      : null;

  return {
    available,
    backend,
    warning
  };
}

function getSelectedStorageBackend(storage: SafeStorageAdapter, platform: NodeJS.Platform): SafeStorageBackend | null {
  if (platform !== "linux") {
    return null;
  }

  return storage.getSelectedStorageBackend();
}

function assertEncryptionAvailable(storage: SafeStorageAdapter): void {
  if (!storage.isEncryptionAvailable()) {
    throw new Error("Electron safeStorage encryption is not available.");
  }
}

function getClaudeSessionKeyPersistenceKey(accountId: string): string {
  return `${accountId}:claude:sessionKey`;
}

function getGitHubTokenPersistenceKey(): string {
  return "app:github:token";
}
