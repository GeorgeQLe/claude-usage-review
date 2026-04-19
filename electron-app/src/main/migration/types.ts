import type { AccountId } from "../../shared/types/accounts.js";
import type { AppSettingsPatch } from "../../shared/types/settings.js";
import type { ClaudeUsageData } from "../../shared/schemas/claudeUsage.js";
import type { MigrationRecord, MigrationRecordSource } from "../storage/migrationRecords.js";

export type MigrationSourceKind = MigrationRecordSource;

export type SkippedSecretCategory =
  | "claude-session-key"
  | "github-token"
  | "provider-auth-token"
  | "api-key"
  | "cookie"
  | "raw-provider-session"
  | "raw-provider-prompt"
  | "raw-provider-output";

export interface MigrationSourceCandidate {
  readonly kind: MigrationSourceKind;
  readonly sourcePath: string;
  readonly userDefaultsPath?: string;
  readonly appSupportPath?: string;
  readonly configPath?: string;
  readonly historyPath?: string;
}

export interface DiscoverMigrationSourcesOptions {
  readonly homeDir: string;
  readonly xdgConfigHome?: string;
  readonly platform?: NodeJS.Platform;
  readonly exists?: (path: string) => boolean;
}

export interface MigrationAccountPlan {
  readonly sourceAccountId: string;
  readonly accountId: AccountId;
  readonly label: string;
  readonly orgId: string | null;
  readonly isActive: boolean;
}

export interface MigrationHistorySnapshotPlan {
  readonly accountId: AccountId | null;
  readonly providerId: "claude";
  readonly capturedAt: string;
  readonly usage: ClaudeUsageData;
}

export interface MigrationImportPlan {
  readonly sourceKind: MigrationSourceKind;
  readonly sourcePath: string;
  readonly accounts: readonly MigrationAccountPlan[];
  readonly appSettings: AppSettingsPatch;
  readonly historySnapshots: readonly MigrationHistorySnapshotPlan[];
  readonly skippedSecretCategories: readonly SkippedSecretCategory[];
  readonly warnings: readonly string[];
}

export interface MigrationImportResult {
  readonly sourceKind: MigrationSourceKind;
  readonly sourcePath: string;
  readonly imported: {
    readonly accounts: number;
    readonly historySnapshots: number;
    readonly appSettings: number;
    readonly providerSettings: number;
  };
  readonly skippedSecretCategories: readonly SkippedSecretCategory[];
  readonly warnings: readonly string[];
  readonly failures: readonly string[];
  readonly record: MigrationRecord;
}
