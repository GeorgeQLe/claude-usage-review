import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { redactDiagnosticPayload } from "./redaction.js";

export type MigrationRecordSource = "swift" | "tauri";
export type MigrationRecordStatus = "pending" | "imported" | "skipped" | "failed";

export interface MigrationRecordSummary {
  readonly sourcePath: string;
  readonly sourceKind: MigrationRecordSource;
  readonly imported: {
    readonly accounts: number;
    readonly historySnapshots: number;
    readonly appSettings: number;
    readonly providerSettings: number;
  };
  readonly skippedSecretCategories: readonly string[];
  readonly warnings: readonly string[];
  readonly failures: readonly string[];
}

export interface MigrationRecord {
  readonly id: string;
  readonly source: MigrationRecordSource;
  readonly status: MigrationRecordStatus;
  readonly summary: MigrationRecordSummary;
  readonly importedAt: string;
}

export interface MigrationRecordStoreOptions {
  readonly database: DatabaseSync;
  readonly idFactory?: () => string;
  readonly now?: () => string;
}

export interface MigrationRecordStore {
  readonly recordMigration: (input: {
    readonly source: MigrationRecordSource;
    readonly status: MigrationRecordStatus;
    readonly summary: MigrationRecordSummary;
  }) => MigrationRecord;
  readonly listMigrationRecords: () => readonly MigrationRecord[];
}

interface MigrationRecordRow {
  readonly id: string;
  readonly source: MigrationRecordSource;
  readonly status: MigrationRecordStatus;
  readonly summary_json: string;
  readonly imported_at: string;
}

export function createMigrationRecordStore(options: MigrationRecordStoreOptions): MigrationRecordStore {
  const database = options.database;
  const idFactory = options.idFactory ?? createDefaultMigrationRecordId;
  const now = options.now ?? (() => new Date().toISOString());

  return {
    recordMigration: (input): MigrationRecord => {
      const id = idFactory();
      const importedAt = now();
      const summary = sanitizeMigrationSummary(input.summary);

      database
        .prepare(
          `
            INSERT INTO migration_records (id, source, status, summary_json, imported_at)
            VALUES (?, ?, ?, ?, ?);
          `
        )
        .run(id, input.source, input.status, JSON.stringify(summary), importedAt);

      return {
        id,
        importedAt,
        source: input.source,
        status: input.status,
        summary
      };
    },
    listMigrationRecords: (): readonly MigrationRecord[] => {
      const rows = database
        .prepare(
          `
            SELECT id, source, status, summary_json, imported_at
            FROM migration_records
            ORDER BY imported_at DESC, id DESC;
          `
        )
        .all() as unknown as MigrationRecordRow[];

      return rows.map(mapMigrationRecordRow);
    }
  };
}

function mapMigrationRecordRow(row: MigrationRecordRow): MigrationRecord {
  return {
    id: row.id,
    source: row.source,
    status: row.status,
    summary: sanitizeMigrationSummary(JSON.parse(row.summary_json) as MigrationRecordSummary),
    importedAt: row.imported_at
  };
}

function sanitizeMigrationSummary(summary: MigrationRecordSummary): MigrationRecordSummary {
  return redactDiagnosticPayload(summary) as unknown as MigrationRecordSummary;
}

function createDefaultMigrationRecordId(): string {
  return `migration-${randomUUID()}`;
}
