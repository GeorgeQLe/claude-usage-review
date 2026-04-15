import type { DatabaseSync } from "node:sqlite";

export type MigrationDatabase = DatabaseSync;

export interface StorageMigration {
  readonly id: number;
  readonly name: string;
  readonly up: (database: MigrationDatabase) => void;
}

export interface AppliedMigration {
  readonly id: number;
  readonly name: string;
}

export const storageMigrations: readonly StorageMigration[] = [
  {
    id: 1,
    name: "foundation_storage_schema",
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS accounts (
          id TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          org_id TEXT,
          is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
          auth_status TEXT NOT NULL CHECK (auth_status IN ('missing_credentials', 'configured', 'expired')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE UNIQUE INDEX IF NOT EXISTS accounts_one_active
          ON accounts(is_active)
          WHERE is_active = 1;

        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS provider_settings (
          provider_id TEXT PRIMARY KEY,
          enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
          settings_json TEXT NOT NULL DEFAULT '{}',
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS usage_snapshots (
          id TEXT PRIMARY KEY,
          account_id TEXT,
          provider_id TEXT NOT NULL,
          captured_at TEXT NOT NULL,
          session_utilization REAL,
          weekly_utilization REAL,
          daily_request_count INTEGER,
          requests_per_minute REAL,
          reset_at TEXT,
          payload_json TEXT NOT NULL,
          FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS usage_snapshots_provider_captured_at
          ON usage_snapshots(provider_id, captured_at);

        CREATE INDEX IF NOT EXISTS usage_snapshots_account_captured_at
          ON usage_snapshots(account_id, captured_at);

        CREATE TABLE IF NOT EXISTS wrapper_events (
          id TEXT PRIMARY KEY,
          provider_id TEXT NOT NULL,
          invocation_id TEXT NOT NULL,
          started_at TEXT NOT NULL,
          ended_at TEXT,
          duration_ms INTEGER,
          command_mode TEXT,
          model TEXT,
          exit_status INTEGER,
          limit_hit INTEGER NOT NULL DEFAULT 0 CHECK (limit_hit IN (0, 1)),
          source_version TEXT,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS wrapper_events_provider_started_at
          ON wrapper_events(provider_id, started_at);

        CREATE UNIQUE INDEX IF NOT EXISTS wrapper_events_provider_invocation
          ON wrapper_events(provider_id, invocation_id);

        CREATE TABLE IF NOT EXISTS parse_bookmarks (
          provider_id TEXT NOT NULL,
          source_path TEXT NOT NULL,
          bookmark_json TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY(provider_id, source_path)
        );

        CREATE TABLE IF NOT EXISTS diagnostics_events (
          id TEXT PRIMARY KEY,
          level TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
          source TEXT NOT NULL,
          message TEXT NOT NULL,
          metadata_json TEXT,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS diagnostics_events_created_at
          ON diagnostics_events(created_at);

        CREATE TABLE IF NOT EXISTS migration_records (
          id TEXT PRIMARY KEY,
          source TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('pending', 'imported', 'skipped', 'failed')),
          summary_json TEXT NOT NULL,
          imported_at TEXT NOT NULL
        );
      `);
    }
  }
];

export function runStorageMigrations(
  database: MigrationDatabase,
  migrations: readonly StorageMigration[] = storageMigrations,
  now: () => string = () => new Date().toISOString()
): readonly AppliedMigration[] {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied: AppliedMigration[] = [];

  for (const migration of migrations) {
    if (isMigrationApplied(database, migration.id)) {
      continue;
    }

    database.exec("BEGIN IMMEDIATE;");
    try {
      migration.up(database);
      database
        .prepare("INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?);")
        .run(migration.id, migration.name, now());
      database.exec("COMMIT;");
      applied.push({ id: migration.id, name: migration.name });
    } catch (error) {
      database.exec("ROLLBACK;");
      throw error;
    }
  }

  return applied;
}

function isMigrationApplied(database: MigrationDatabase, id: number): boolean {
  const row = database.prepare("SELECT id FROM schema_migrations WHERE id = ?;").get(id);
  return row !== undefined;
}
