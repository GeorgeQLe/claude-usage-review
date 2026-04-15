import { describe, expect, it, vi } from "vitest";
import { runStorageMigrations, storageMigrations, type MigrationDatabase, type StorageMigration } from "./main/storage/migrations.js";
import { redactDiagnosticPayload, redactSecret, redactText, stringifyRedactedDiagnosticPayload } from "./main/storage/redaction.js";
import { createSecretStore, getSecretStorageStatus, type SecretEnvelope } from "./main/storage/secrets.js";

vi.mock("electron", () => ({
  safeStorage: {
    decryptString: vi.fn(),
    encryptString: vi.fn(),
    getSelectedStorageBackend: vi.fn(() => "basic_text"),
    isEncryptionAvailable: vi.fn(() => true)
  }
}));

describe("foundation redaction helpers", () => {
  it("redacts direct secrets, bearer tokens, GitHub tokens, cookies, and session keys", () => {
    const fakeBearerToken = "tokenvalue".repeat(2);
    const fakeGitHubToken = `ghp_${"1".repeat(24)}`;

    expect(redactSecret("synthetic-session-secret")).toBe("[REDACTED]");
    const redacted = redactText(
      `Authorization: Bearer ${fakeBearerToken} sessionKey=synthetic-session-secret ${fakeGitHubToken}`
    );

    expect(redacted).toContain("Authorization=[REDACTED]");
    expect(redacted).toContain("sessionKey=[REDACTED]");
    expect(redacted).not.toContain(fakeBearerToken);
    expect(redacted).not.toContain("synthetic-session-secret");
    expect(redacted).not.toContain(fakeGitHubToken);
  });

  it("redacts secret-like diagnostic keys and raw prompt/stdout fields recursively", () => {
    const redacted = redactDiagnosticPayload({
      provider: "codex",
      nested: {
        prompt: "summarize this private file",
        stdout: "raw model output",
        cookie: "__Secure-next-auth.session-token=secret"
      },
      events: [{ github_token: `ghp_${"1".repeat(24)}` }]
    });

    expect(redacted).toEqual({
      provider: "codex",
      nested: {
        prompt: "[REDACTED]",
        stdout: "[REDACTED]",
        cookie: "[REDACTED]"
      },
      events: [{ github_token: "[REDACTED]" }]
    });
    expect(stringifyRedactedDiagnosticPayload(redacted)).not.toContain("private file");
  });
});

describe("foundation secret storage wrapper", () => {
  it("encrypts and decrypts through the injected safeStorage boundary", () => {
    const storage = createFakeSafeStorage();
    const store = createSecretStore(storage);

    const envelope = store.encryptSecret("session-secret");

    expect(envelope).toEqual({
      version: 1,
      encryptedBase64: Buffer.from("encrypted:session-secret").toString("base64")
    });
    expect(store.decryptSecret(envelope)).toBe("session-secret");
    expect(storage.encryptString).toHaveBeenCalledWith("session-secret");
  });

  it("reports Linux basic_text as a weak-backend warning only on Linux", () => {
    const storage = createFakeSafeStorage({ backend: "basic_text" });

    expect(getSecretStorageStatus(storage, "linux").warning).toContain("weaker local protection");
    expect(getSecretStorageStatus(storage, "darwin").warning).toBeNull();
  });

  it("throws before encrypting or decrypting when safeStorage encryption is unavailable", () => {
    const store = createSecretStore(createFakeSafeStorage({ available: false }));
    const envelope: SecretEnvelope = {
      version: 1,
      encryptedBase64: Buffer.from("encrypted:session-secret").toString("base64")
    };

    expect(() => store.encryptSecret("session-secret")).toThrow("encryption is not available");
    expect(() => store.decryptSecret(envelope)).toThrow("encryption is not available");
  });
});

describe("foundation storage migrations", () => {
  it("applies migrations once and records schema migration rows", () => {
    const database = new FakeMigrationDatabase();
    const migrations: readonly StorageMigration[] = [
      {
        id: 1,
        name: "one",
        up: (db) => {
          db.exec("CREATE TABLE one (id TEXT);");
        }
      }
    ];

    expect(runStorageMigrations(database, migrations, () => "2026-04-15T12:00:00.000Z")).toEqual([
      { id: 1, name: "one" }
    ]);
    expect(runStorageMigrations(database, migrations, () => "2026-04-15T12:00:00.000Z")).toEqual([]);
    expect(database.executedSql.join("\n")).toContain("CREATE TABLE one");
  });

  it("keeps the production foundation schema focused on app data, telemetry, and migration records", () => {
    const database = new FakeMigrationDatabase();

    runStorageMigrations(database, storageMigrations, () => "2026-04-15T12:00:00.000Z");

    const sql = database.executedSql.join("\n");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS accounts");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS usage_snapshots");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS wrapper_events");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS diagnostics_events");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS migration_records");
  });
});

function createFakeSafeStorage(options: { readonly available?: boolean; readonly backend?: string } = {}) {
  const available = options.available ?? true;
  const backend = options.backend ?? "gnome_libsecret";

  return {
    decryptString: vi.fn((buffer: Buffer) => buffer.toString("utf8").replace(/^encrypted:/u, "")),
    encryptString: vi.fn((value: string) => Buffer.from(`encrypted:${value}`, "utf8")),
    getSelectedStorageBackend: vi.fn(() => backend),
    isEncryptionAvailable: vi.fn(() => available)
  } as never;
}

class FakeMigrationDatabase {
  readonly executedSql: string[] = [];
  private readonly appliedMigrationIds = new Set<number>();

  exec(sql: string): void {
    this.executedSql.push(sql);
  }

  prepare(sql: string) {
    if (sql.startsWith("SELECT id FROM schema_migrations")) {
      return {
        get: (id: number) => (this.appliedMigrationIds.has(id) ? { id } : undefined)
      };
    }

    if (sql.startsWith("INSERT INTO schema_migrations")) {
      return {
        run: (id: number) => {
          this.appliedMigrationIds.add(id);
          return {};
        }
      };
    }

    throw new Error(`Unexpected prepared statement: ${sql}`);
  }
}

const _typeCheckFakeDatabase: MigrationDatabase = new FakeMigrationDatabase() as never;
