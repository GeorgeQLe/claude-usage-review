import { basename } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { DiagnosticsExportResult } from "../../shared/types/ipc.js";
import type { ProviderCard, ProviderId } from "../../shared/types/provider.js";
import type { AppSettings, ProviderPlaceholderSettings } from "../../shared/types/settings.js";
import type { UsageState } from "../../shared/types/usage.js";
import {
  createDiagnosticsEventStore,
  createMigrationRecordStore,
  createParseBookmarkStore,
  createWrapperEventStore,
  redactDiagnosticPayload,
  redactText,
  type SecretStorageStatus,
  type WrapperEventsSummary
} from "../storage/index.js";

export interface DiagnosticsServiceOptions {
  readonly appName: string;
  readonly appVersion: string;
  readonly database: DatabaseSync;
  readonly databasePath?: string;
  readonly getSecretStorageStatus: () => SecretStorageStatus;
  readonly getSettings: () => AppSettings;
  readonly getUsageState: () => UsageState;
  readonly now?: () => string;
  readonly platform?: NodeJS.Platform;
}

export interface DiagnosticsService {
  readonly exportDiagnostics: () => DiagnosticsExportResult;
}

const providerIdsWithLocalDiagnostics = ["codex", "gemini"] as const;
const recentEventLimit = 20;

export function createDiagnosticsService(options: DiagnosticsServiceOptions): DiagnosticsService {
  const now = options.now ?? (() => new Date().toISOString());
  const diagnosticsEventStore = createDiagnosticsEventStore({ database: options.database });
  const migrationRecordStore = createMigrationRecordStore({ database: options.database });
  const parseBookmarkStore = createParseBookmarkStore({ database: options.database });
  const wrapperEventStore = createWrapperEventStore({ database: options.database });

  return {
    exportDiagnostics: (): DiagnosticsExportResult => {
      const generatedAt = now();
      const settings = options.getSettings();
      const usageState = options.getUsageState();
      const secretStorage = options.getSecretStorageStatus();
      const wrapperSummaries = providerIdsWithLocalDiagnostics.map((providerId) =>
        wrapperEventStore.summarizeWrapperEvents({ providerId })
      );
      const recentEvents = diagnosticsEventStore.listRecentDiagnosticsEvents({ limit: recentEventLimit });
      const bookmarks = parseBookmarkStore.listParseBookmarks();
      const migrations = migrationRecordStore.listMigrationRecords();
      const providerFailureCount = usageState.providers.filter((provider) =>
        provider.status === "degraded" || provider.status === "expired" || provider.status === "missing_configuration"
      ).length;
      const eventFailureCount = recentEvents.filter((event) => event.level === "warn" || event.level === "error").length;

      return sanitizeDiagnosticsExport({
        generatedAt,
        summary: `${options.appName} diagnostics export: ${usageState.providers.length} providers, ${providerFailureCount + eventFailureCount} warnings or failures, ${recentEvents.length} recent log events.`,
        entries: [
          formatAppEntry(options, generatedAt),
          formatStorageEntry(secretStorage, options.databasePath),
          formatRefreshEntry(usageState),
          formatOverlayEntry(settings),
          ...providerIdsWithLocalDiagnostics.map((providerId) =>
            formatProviderSettingsEntry(providerId, settings.providers[providerId])
          ),
          ...usageState.providers.map(formatProviderEntry),
          ...wrapperSummaries.map(formatWrapperSummaryEntry),
          ...bookmarks.map((bookmark) =>
            `Parse bookmark: ${formatProviderName(bookmark.providerId)} ${bookmark.sourceName} updated ${bookmark.updatedAt}; ${JSON.stringify(redactDiagnosticPayload(bookmark.bookmark))}`
          ),
          ...migrations.slice(0, 5).map((record) =>
            `Migration: ${record.source} ${record.status} at ${record.importedAt}; imported ${record.summary.imported.accounts} accounts, ${record.summary.imported.historySnapshots} history snapshots, ${record.summary.imported.providerSettings} provider settings; skipped ${record.summary.skippedSecretCategories.length} secret categories; failures ${record.summary.failures.length}.`
          ),
          ...recentEvents.map((event) =>
            `Recent log: ${event.createdAt} ${event.level} ${event.source}: ${event.message}${event.metadata === null ? "" : ` ${JSON.stringify(redactDiagnosticPayload(event.metadata))}`}`
          )
        ]
      });
    }
  };
}

function formatAppEntry(options: DiagnosticsServiceOptions, generatedAt: string): string {
  return `App: ${options.appName} ${options.appVersion}; platform ${options.platform ?? process.platform}; generated ${generatedAt}.`;
}

function formatStorageEntry(secretStorage: SecretStorageStatus, databasePath: string | undefined): string {
  const databaseName = databasePath ? basename(databasePath) : "app database";
  const backend = secretStorage.backend ?? "native";
  const warning = secretStorage.warning ? ` Warning: ${secretStorage.warning}` : "";

  return `Storage: ${databaseName}; safeStorage ${secretStorage.available ? "available" : "unavailable"}; backend ${backend}.${warning}`;
}

function formatRefreshEntry(usageState: UsageState): string {
  const providerRefreshTimes = usageState.providers
    .map((provider) => `${provider.displayName} ${provider.lastUpdatedAt ?? "not refreshed"}`)
    .join(", ");

  return `Refresh: app ${usageState.lastUpdatedAt ?? "not refreshed"}; providers ${providerRefreshTimes}.`;
}

function formatOverlayEntry(settings: AppSettings): string {
  return `Overlay: ${settings.overlay.enabled ? "enabled" : "disabled"}, ${settings.overlay.visible ? "visible" : "hidden"}, ${settings.overlay.layout}; opacity ${settings.overlay.opacity}.`;
}

function formatProviderSettingsEntry(providerId: ProviderId, settings: ProviderPlaceholderSettings): string {
  return `${formatProviderName(providerId)} settings: ${settings.enabled ? "enabled" : "disabled"}; ${settings.accuracyModeEnabled ? "Accuracy Mode on" : "Accuracy Mode off"}; auth ${settings.authMode}; plan ${settings.plan}; last refresh ${settings.lastRefreshAt ?? "not refreshed"}.`;
}

function formatProviderEntry(provider: ProviderCard): string {
  return `Provider: ${provider.displayName}; ${provider.status}; ${provider.confidence}; ${provider.adapterMode}; ${provider.headline}; ${provider.detailText ?? "no detail"}; daily requests ${provider.dailyRequestCount ?? "unknown"}; rate ${provider.requestsPerMinute ?? "unknown"}/min; reset ${provider.resetAt ?? "unknown"}; last refresh ${provider.lastUpdatedAt ?? "not refreshed"}.`;
}

function formatWrapperSummaryEntry(summary: WrapperEventsSummary): string {
  return `${formatProviderName(summary.providerId)} wrapper: ${summary.invocationCount} invocations; ${summary.limitHitCount} limit signals; latest start ${summary.latestStartedAt ?? "none"}; latest finish ${summary.latestEndedAt ?? "none"}.`;
}

function sanitizeDiagnosticsExport(exportResult: DiagnosticsExportResult): DiagnosticsExportResult {
  return {
    generatedAt: exportResult.generatedAt,
    summary: sanitizeDiagnosticsText(exportResult.summary),
    entries: exportResult.entries.map(sanitizeDiagnosticsText).filter(Boolean)
  };
}

function sanitizeDiagnosticsText(value: string): string {
  return redactText(value)
    .replace(
      /(access[_-]?token|api[_-]?key|authorization|bearer|cookie|session[_-]?key|github[_-]?token|provider[_-]?auth|raw prompt|prompt|raw stdout|stdout|raw stderr|stderr|oauth[_-]?creds|raw chat|chat body)/giu,
      "redacted"
    )
    .slice(0, 1200);
}

function formatProviderName(providerId: ProviderId): string {
  if (providerId === "codex") {
    return "Codex";
  }

  if (providerId === "gemini") {
    return "Gemini";
  }

  if (providerId === "claude") {
    return "Claude";
  }

  return providerId;
}
