import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { appSettingsSchema } from "../../shared/schemas/settings.js";
import { createDefaultAppSettings, createDefaultProviderSettings, mergeAppSettings } from "../../shared/settings/defaults.js";
import type { AppSettings, AppSettingsPatch, ProviderPlaceholderSettings } from "../../shared/types/settings.js";
import { createMigrationRecordStore } from "../storage/migrationRecords.js";
import { parseMigrationSource } from "./parsers.js";
import type { MigrationImportPlan, MigrationImportResult, MigrationSourceCandidate } from "./types.js";

export interface MigrationServiceOptions {
  readonly database: DatabaseSync;
  readonly idFactory?: () => string;
  readonly now?: () => string;
  readonly currentSettings?: AppSettings;
}

export interface MigrationService {
  readonly buildImportPlan: (candidate: MigrationSourceCandidate) => MigrationImportPlan;
  readonly runImportPlan: (plan: MigrationImportPlan) => MigrationImportResult;
  readonly importSource: (candidate: MigrationSourceCandidate) => MigrationImportResult;
}

type MutableImportedCounts = {
  -readonly [Key in keyof MigrationImportResult["imported"]]: MigrationImportResult["imported"][Key];
};

export function createMigrationService(options: MigrationServiceOptions): MigrationService {
  const database = options.database;
  const now = options.now ?? (() => new Date().toISOString());
  const recordStore = createMigrationRecordStore({
    database,
    idFactory: options.idFactory,
    now
  });

  return {
    buildImportPlan: parseMigrationSource,
    runImportPlan: (plan) => runImportPlan({ ...options, database, now }, plan, recordStore),
    importSource: (candidate) => runImportPlan({ ...options, database, now }, parseMigrationSource(candidate), recordStore)
  };
}

function runImportPlan(
  options: Required<Pick<MigrationServiceOptions, "database" | "now">> & Omit<MigrationServiceOptions, "database" | "now">,
  plan: MigrationImportPlan,
  recordStore: ReturnType<typeof createMigrationRecordStore>
): MigrationImportResult {
  const imported = emptyImportedCounts();
  const failures: string[] = [];

  try {
    options.database.exec("BEGIN IMMEDIATE;");
    try {
      imported.accounts = importAccounts(options.database, plan, options.now);
      imported.historySnapshots = importHistorySnapshots(options.database, plan, options);
      imported.appSettings = importAppSettings(options.database, plan.appSettings, options.currentSettings, options.now);
      imported.providerSettings = importProviderSettings(options.database, plan.appSettings, options.now);
      options.database.exec("COMMIT;");
    } catch (error) {
      options.database.exec("ROLLBACK;");
      throw error;
    }
  } catch (error) {
    failures.push(errorMessage(error));
    const record = recordStore.recordMigration({
      source: plan.sourceKind,
      status: "failed",
      summary: {
        sourceKind: plan.sourceKind,
        sourcePath: plan.sourcePath,
        imported,
        skippedSecretCategories: plan.skippedSecretCategories,
        warnings: plan.warnings,
        failures
      }
    });

    return {
      sourceKind: plan.sourceKind,
      sourcePath: plan.sourcePath,
      imported,
      skippedSecretCategories: plan.skippedSecretCategories,
      warnings: plan.warnings,
      failures,
      record
    };
  }

  const status = hasImportedAny(imported) ? "imported" : "skipped";
  const record = recordStore.recordMigration({
    source: plan.sourceKind,
    status,
    summary: {
      sourceKind: plan.sourceKind,
      sourcePath: plan.sourcePath,
      imported,
      skippedSecretCategories: plan.skippedSecretCategories,
      warnings: plan.warnings,
      failures
    }
  });

  return {
    sourceKind: plan.sourceKind,
    sourcePath: plan.sourcePath,
    imported,
    skippedSecretCategories: plan.skippedSecretCategories,
    warnings: plan.warnings,
    failures,
    record
  };
}

function importAccounts(database: DatabaseSync, plan: MigrationImportPlan, now: () => string): number {
  let imported = 0;
  const timestamp = now();

  for (const account of plan.accounts) {
    if (accountExists(database, account.accountId)) {
      continue;
    }

    database
      .prepare(
        `
          INSERT INTO accounts (id, label, org_id, is_active, auth_status, created_at, updated_at)
          VALUES (?, ?, ?, 0, 'missing_credentials', ?, ?);
        `
      )
      .run(account.accountId, account.label, account.orgId, timestamp, timestamp);
    imported += 1;
  }

  const activeAccount = plan.accounts.find((account) => account.isActive);
  if (activeAccount && accountExists(database, activeAccount.accountId)) {
    database.prepare("UPDATE accounts SET is_active = 0, updated_at = ? WHERE is_active = 1;").run(timestamp);
    database.prepare("UPDATE accounts SET is_active = 1, updated_at = ? WHERE id = ?;").run(timestamp, activeAccount.accountId);
  } else if (countAccounts(database) > 0 && !hasActiveAccount(database)) {
    const firstAccount = database.prepare("SELECT id FROM accounts ORDER BY created_at ASC, id ASC LIMIT 1;").get() as
      | { readonly id: string }
      | undefined;
    if (firstAccount) {
      database.prepare("UPDATE accounts SET is_active = 1, updated_at = ? WHERE id = ?;").run(timestamp, firstAccount.id);
    }
  }

  return imported;
}

function importHistorySnapshots(
  database: DatabaseSync,
  plan: MigrationImportPlan,
  options: MigrationServiceOptions & Required<Pick<MigrationServiceOptions, "database" | "now">>
): number {
  let imported = 0;
  const idFactory = options.idFactory ?? (() => `migration-snapshot-${randomUUID()}`);

  for (const snapshot of plan.historySnapshots) {
    const snapshotId = idFactory();
    database
      .prepare(
        `
          INSERT INTO usage_snapshots (
            id,
            account_id,
            provider_id,
            captured_at,
            session_utilization,
            weekly_utilization,
            daily_request_count,
            requests_per_minute,
            reset_at,
            payload_json
          )
          VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?);
        `
      )
      .run(
        snapshotId,
        snapshot.accountId,
        snapshot.providerId,
        snapshot.capturedAt,
        snapshot.usage.fiveHour.utilization,
        snapshot.usage.sevenDay.utilization,
        snapshot.usage.fiveHour.resetsAt,
        JSON.stringify(snapshot.usage)
      );
    imported += 1;
  }

  return imported;
}

function importAppSettings(
  database: DatabaseSync,
  patch: AppSettingsPatch,
  currentSettings: AppSettings | undefined,
  now: () => string
): number {
  const appPatch = stripProviderSettings(patch);
  if (Object.keys(appPatch).length === 0) {
    return 0;
  }

  const settings = appSettingsSchema.parse(mergeAppSettings(currentSettings ?? createDefaultAppSettings(), appPatch));
  database
    .prepare(
      `
        INSERT INTO app_settings (key, value_json, updated_at)
        VALUES ('app', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at;
      `
    )
    .run(JSON.stringify(settings), now());

  return 1;
}

function importProviderSettings(database: DatabaseSync, patch: AppSettingsPatch, now: () => string): number {
  const providers = patch.providers;
  if (!providers) {
    return 0;
  }

  let imported = 0;
  for (const providerId of ["codex", "gemini"] as const) {
    const providerPatch = providers[providerId];
    if (!providerPatch) {
      continue;
    }

    const settings: ProviderPlaceholderSettings = {
      ...createDefaultProviderSettings(),
      ...providerPatch
    };
    database
      .prepare(
        `
          INSERT INTO provider_settings (provider_id, enabled, settings_json, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(provider_id) DO UPDATE SET
            enabled = excluded.enabled,
            settings_json = excluded.settings_json,
            updated_at = excluded.updated_at;
        `
      )
      .run(providerId, settings.enabled ? 1 : 0, JSON.stringify(settings), now());
    imported += 1;
  }

  return imported;
}

function stripProviderSettings(patch: AppSettingsPatch): AppSettingsPatch {
  const { providers: _providers, ...appPatch } = patch;
  return appPatch;
}

function accountExists(database: DatabaseSync, accountId: string): boolean {
  return database.prepare("SELECT id FROM accounts WHERE id = ?;").get(accountId) !== undefined;
}

function hasActiveAccount(database: DatabaseSync): boolean {
  return database.prepare("SELECT id FROM accounts WHERE is_active = 1 LIMIT 1;").get() !== undefined;
}

function countAccounts(database: DatabaseSync): number {
  const row = database.prepare("SELECT COUNT(*) AS count FROM accounts;").get() as { readonly count: number };
  return row.count;
}

function emptyImportedCounts(): MutableImportedCounts {
  return {
    accounts: 0,
    historySnapshots: 0,
    appSettings: 0,
    providerSettings: 0
  };
}

function hasImportedAny(imported: MigrationImportResult["imported"]): boolean {
  return Object.values(imported).some((count) => count > 0);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
