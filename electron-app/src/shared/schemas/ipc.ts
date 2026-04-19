import { z } from "zod";
import { appSettingsPatchSchema } from "./settings.js";

export const addAccountPayloadSchema = z.object({
  label: z.string().min(1)
});

export const accountIdPayloadSchema = z.object({
  accountId: z.string().min(1)
});

export const renameAccountPayloadSchema = z.object({
  accountId: z.string().min(1),
  label: z.string().min(1)
});

export const saveClaudeCredentialsPayloadSchema = z.object({
  accountId: z.string().min(1),
  sessionKey: z.string().min(1),
  orgId: z.string().min(1)
});

export const testClaudeConnectionPayloadSchema = z.object({
  sessionKey: z.string().min(1),
  orgId: z.string().min(1)
});

export const getUsageHistoryPayloadSchema = z
  .object({
    accountId: z.string().min(1).nullable().optional(),
    providerId: z.string().min(1).optional()
  })
  .optional();

export const updateSettingsPayloadSchema = z.object({
  patch: appSettingsPatchSchema
});

export const providerCommandPayloadSchema = z.object({
  providerId: z.string().min(1)
});

export const claudeConnectionTestResultSchema = z.object({
  ok: z.boolean(),
  status: z.enum(["not_implemented", "connected", "auth_expired", "network_error", "invalid"]),
  message: z.string()
}).strip();

export const usageHistoryPointSchema = z.object({
  capturedAt: z.string().datetime(),
  accountId: z.string().min(1).nullable(),
  providerId: z.string().min(1),
  sessionUtilization: z.number().min(0).max(1).nullable(),
  weeklyUtilization: z.number().min(0).max(1).nullable(),
  resetAt: z.string().datetime().nullable()
});

export const usageHistoryResultSchema = z.object({
  points: z.array(usageHistoryPointSchema),
  generatedAt: z.string().datetime()
});

export const githubContributionDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  contributionCount: z.number().int().min(0)
});

export const githubContributionWeekSchema = z.object({
  contributionDays: z.array(githubContributionDaySchema)
});

export const githubHeatmapResultSchema = z.object({
  enabled: z.boolean(),
  configured: z.boolean(),
  username: z.string().min(1).nullable(),
  status: z.enum(["disabled", "not_configured", "configured", "loading", "ready", "error", "auth_expired"]),
  weeks: z.array(githubContributionWeekSchema),
  totalContributions: z.number().int().min(0),
  lastFetchedAt: z.string().datetime().nullable(),
  nextRefreshAt: z.string().datetime().nullable(),
  error: z.string().nullable()
});

export const saveGitHubSettingsPayloadSchema = z.object({
  enabled: z.boolean(),
  username: z.string().min(1).nullable(),
  token: z.string().min(1).nullable().optional()
});

export const providerDiagnosticsResultSchema = z.object({
  providerId: z.string().min(1),
  status: z.enum(["not_configured", "ready", "degraded"]),
  messages: z.array(z.string()),
  lastCheckedAt: z.string().datetime().nullable()
});

export const providerDetectionResultSchema = z.object({
  providerId: z.string().min(1),
  detected: z.boolean(),
  confidence: z.enum(["exact", "high_confidence", "estimated", "observed_only"]),
  message: z.string()
});

export const wrapperSetupResultSchema = z.object({
  providerId: z.string().min(1),
  command: z.string().nullable(),
  instructions: z.array(z.string()),
  mutatesShellProfiles: z.literal(false).optional(),
  removalInstructions: z.array(z.string()).optional(),
  setupCommands: z.array(z.string()).optional(),
  shellProfilesTouched: z.array(z.string()).optional(),
  verified: z.boolean(),
  wrapperPath: z.string().min(1).optional(),
  wrapperVersion: z.string().min(1).optional()
});

export const wrapperVerificationResultSchema = z.object({
  providerId: z.string().min(1),
  status: z.enum(["missing_command", "native_cli_active", "wrapper_active", "stale_wrapper", "unverified"]).optional(),
  verified: z.boolean(),
  message: z.string(),
  wrapperVersion: z.string().min(1).optional()
});

export const migrationSourceKindSchema = z.enum(["swift", "tauri"]);

export const skippedSecretCategorySchema = z.enum([
  "claude-session-key",
  "github-token",
  "provider-auth-token",
  "api-key",
  "cookie",
  "raw-provider-session",
  "raw-provider-prompt",
  "raw-provider-output"
]);

export const migrationMetadataCountsSchema = z.object({
  accounts: z.number().int().min(0),
  historySnapshots: z.number().int().min(0),
  appSettings: z.number().int().min(0),
  providerSettings: z.number().int().min(0)
});

export const migrationCandidateSummarySchema = z.object({
  candidateId: z.string().min(1),
  sourceKind: migrationSourceKindSchema,
  displayName: z.string().min(1),
  status: z.enum(["ready", "error"]),
  metadataCounts: migrationMetadataCountsSchema,
  skippedSecretCategories: z.array(skippedSecretCategorySchema),
  warnings: z.array(z.string()),
  error: z.string().nullable()
});

export const migrationScanResultSchema = z.object({
  scannedAt: z.string().datetime(),
  candidates: z.array(migrationCandidateSummarySchema)
});

export const runMigrationImportPayloadSchema = z.object({
  candidateId: z.string().min(1)
});

export const migrationRecordUiSummarySchema = z.object({
  id: z.string().min(1),
  sourceKind: migrationSourceKindSchema,
  displayName: z.string().min(1),
  status: z.enum(["pending", "imported", "skipped", "failed"]),
  importedAt: z.string().datetime(),
  metadataCounts: migrationMetadataCountsSchema,
  skippedSecretCategories: z.array(skippedSecretCategorySchema),
  warnings: z.array(z.string()),
  failures: z.array(z.string())
});

export const migrationImportUiResultSchema = z.object({
  sourceKind: migrationSourceKindSchema,
  displayName: z.string().min(1),
  status: z.enum(["imported", "skipped", "failed"]),
  importedAt: z.string().datetime(),
  metadataCounts: migrationMetadataCountsSchema,
  skippedSecretCategories: z.array(skippedSecretCategorySchema),
  warnings: z.array(z.string()),
  failures: z.array(z.string()),
  record: migrationRecordUiSummarySchema
});

export const migrationRecordsResultSchema = z.object({
  records: z.array(migrationRecordUiSummarySchema),
  generatedAt: z.string().datetime()
});

export const diagnosticsExportResultSchema = z.object({
  generatedAt: z.string().datetime(),
  summary: z.string(),
  entries: z.array(z.string())
});
