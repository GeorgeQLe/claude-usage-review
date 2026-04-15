import { safeStorage, type SafeStorage } from "electron";

export type SafeStorageBackend = ReturnType<SafeStorage["getSelectedStorageBackend"]>;

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

export function createSecretStore(storage: SafeStorage = safeStorage, platform: NodeJS.Platform = process.platform): SecretStore {
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

export function getSecretStorageStatus(
  storage: SafeStorage = safeStorage,
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

function getSelectedStorageBackend(storage: SafeStorage, platform: NodeJS.Platform): SafeStorageBackend | null {
  if (platform !== "linux") {
    return null;
  }

  return storage.getSelectedStorageBackend();
}

function assertEncryptionAvailable(storage: SafeStorage): void {
  if (!storage.isEncryptionAvailable()) {
    throw new Error("Electron safeStorage encryption is not available.");
  }
}
