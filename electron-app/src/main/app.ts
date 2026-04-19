import { app } from "electron";
import { AppWindowManager } from "./windows.js";
import { runElectronSmokeSuite } from "./smoke.js";
import { syncLaunchAtLogin, TrayController, type TrayFallbackStatus } from "./tray.js";
import {
  registerIpcHandlers,
  type IpcDiagnosticsDependencies,
  type IpcMigrationDependencies,
  type IpcRegistration
} from "./ipc.js";
import { createLocalNotificationService, type LocalNotificationService } from "./services/notifications.js";
import { getSecretStorageStatus } from "./storage/secrets.js";
import { openAppDatabase, createMigrationRecordStore, type OpenedAppDatabase } from "./storage/index.js";
import {
  createMigrationService,
  discoverMigrationSources,
  type MigrationImportPlan,
  type MigrationImportResult,
  type MigrationSourceCandidate
} from "./migration/index.js";
import { createDiagnosticsService } from "./diagnostics/service.js";
import { createWrapperGenerationService } from "./wrappers/generator.js";
import { createWrapperVerificationService } from "./wrappers/verification.js";
import { createDefaultAppSettings, mergeAppSettings } from "../shared/settings/defaults.js";
import { appSettingsSchema } from "../shared/schemas/settings.js";
import { usageStateSchema } from "../shared/schemas/usage.js";
import type {
  MigrationCandidateSummary,
  MigrationImportUiResult,
  MigrationMetadataCounts,
  MigrationRecordUiSummary,
  MigrationRecordsResult,
  MigrationScanResult
} from "../shared/types/ipc.js";
import type { ProviderId } from "../shared/types/provider.js";
import type { AppSettings, AppSettingsPatch } from "../shared/types/settings.js";
import type { UsageState } from "../shared/types/usage.js";

const isSmokeMode = process.env.CLAUDE_USAGE_ELECTRON_SMOKE === "1";
const isDevelopment = !app.isPackaged && !isSmokeMode;
const rendererDevServerUrl = process.env.ELECTRON_RENDERER_URL ?? "http://127.0.0.1:5173";

let windowManager: AppWindowManager | null = null;
let trayController: TrayController | null = null;
let ipcRegistration: IpcRegistration | null = null;
let notificationService: LocalNotificationService | null = null;
let openedDatabase: OpenedAppDatabase | null = null;
let isQuitting = false;
let settings = appSettingsSchema.parse(createDefaultAppSettings());
let usageState = createInitialUsageState();

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.setAppUserModelId("com.claudeusage.electron");
  app.on("second-instance", () => {
    void windowManager?.focusPrimaryWindow();
  });
  app.on("before-quit", () => {
    isQuitting = true;
  });
  app.on("will-quit", () => {
    trayController?.dispose();
    windowManager?.dispose();
    ipcRegistration?.dispose();
    openedDatabase?.close();
  });
  app.on("window-all-closed", () => {
    if (isQuitting || !trayController?.getFallbackStatus().available) {
      app.quit();
    }
  });
  app.on("activate", () => {
    void windowManager?.focusPrimaryWindow();
  });

  void app.whenReady().then(startApp).catch((error: unknown) => {
    console.error("Failed to start ClaudeUsage Electron runtime.", error);
    app.quit();
  });
}

async function startApp(): Promise<void> {
  openedDatabase = openAppDatabase();
  notificationService = createLocalNotificationService();
  const wrapperGenerationService = createWrapperGenerationService({
    appUserDataDir: app.getPath("userData")
  });
  const wrapperVerificationService = createWrapperVerificationService({
    appUserDataDir: app.getPath("userData")
  });

  windowManager = new AppWindowManager({
    isDevelopment,
    devServerUrl: rendererDevServerUrl,
    getOverlaySettings: () => settings.overlay,
    updateOverlaySettings: (patch) => {
      updateSettings({ overlay: patch });
    }
  });

  ipcRegistration = registerIpcHandlers({
    usageState: {
      getUsageState: () => usageState,
      refreshNow: refreshUsageState
    },
    notifications: {
      evaluateUsageState: (usageState) => {
        notificationService?.evaluateUsageState({
          usageState,
          settings: settings.notifications
        });
      }
    },
    settings: {
      getSettings: () => settings,
      updateSettings
    },
    wrappers: {
      generateWrapper: wrapperGenerationService.generateWrapper,
      verifyWrapper: wrapperVerificationService.verifyWrapper
    },
    migration: isSmokeMode ? createSmokeMigrationIpcDependencies() : createMigrationIpcDependencies(),
    diagnostics: isSmokeMode ? createSmokeDiagnosticsIpcDependencies() : createDiagnosticsIpcDependencies(),
    windows: {
      openPopover: () => {
        void windowManager?.showPopover();
      },
      hideOverlay: () => {
        windowManager?.hideOverlay();
      }
    }
  });

  trayController = new TrayController({
    showPopover: () => {
      void windowManager?.showPopover();
    },
    refreshNow: refreshUsageState,
    openSettings: () => {
      void windowManager?.openSettings();
    },
    toggleOverlay: () => {
      void windowManager?.toggleOverlay();
    },
    openOnboarding: () => {
      void windowManager?.openOnboarding();
    },
    quit: () => {
      isQuitting = true;
      app.quit();
    },
    initialState: {
      settings,
      usageState
    }
  });

  const trayStatus = trayController.create();
  reportTrayFallback(trayStatus);
  syncLaunchAtLogin(app, settings.launchAtLogin);

  if (isSmokeMode) {
    await runElectronSmokeSuite({
      updateSettings: (patch) => {
        updateSettings(patch);
      },
      windowManager
    });
    console.log("CLAUDE_USAGE_ELECTRON_SMOKE_OK");
    setTimeout(() => {
      isQuitting = true;
      app.quit();
    }, 50);
    return;
  }

  await windowManager.showPopover();
}

function createSmokeMigrationIpcDependencies(): IpcMigrationDependencies {
  let records: MigrationRecordsResult["records"] = [];
  const skippedSecretCategories: MigrationCandidateSummary["skippedSecretCategories"] = [
    "claude-session-key",
    "github-token",
    "provider-auth-token",
    "api-key",
    "cookie",
    "raw-provider-session",
    "raw-provider-prompt",
    "raw-provider-output"
  ];
  const metadataCounts = {
    accounts: 1,
    appSettings: 1,
    historySnapshots: 2,
    providerSettings: 2
  };

  return {
    scanSources: (): MigrationScanResult => ({
      scannedAt: "2026-04-19T12:00:00.000Z",
      candidates: [
        {
          candidateId: "swift-smoke-1",
          displayName: "Swift ClaudeUsage app",
          error: null,
          metadataCounts,
          skippedSecretCategories,
          sourceKind: "swift",
          status: "ready",
          warnings: []
        }
      ]
    }),
    runImport: (candidateId: string): MigrationImportUiResult => {
      if (candidateId !== "swift-smoke-1") {
        throw new Error("Unknown smoke migration source.");
      }

      const record: MigrationRecordUiSummary = {
        displayName: "Swift ClaudeUsage app",
        failures: [],
        id: "migration-smoke-1",
        importedAt: "2026-04-19T12:01:00.000Z",
        metadataCounts,
        skippedSecretCategories,
        sourceKind: "swift",
        status: "imported",
        warnings: []
      };
      records = [record];

      return {
        displayName: "Swift ClaudeUsage app",
        failures: [],
        importedAt: record.importedAt,
        metadataCounts,
        record,
        skippedSecretCategories,
        sourceKind: "swift",
        status: "imported",
        warnings: []
      };
    },
    listRecords: (): MigrationRecordsResult => ({
      generatedAt: "2026-04-19T12:02:00.000Z",
      records
    })
  };
}

function createSmokeDiagnosticsIpcDependencies(): IpcDiagnosticsDependencies {
  return {
    exportDiagnostics: () => ({
      entries: [
        "App: ClaudeUsage 0.1.0; platform smoke.",
        "Storage: claude-usage.sqlite3; safeStorage available; backend native.",
        "Provider: Codex configured; redacted diagnostics only.",
        "Recent log: provider redacted diagnostics."
      ],
      generatedAt: "2026-04-19T12:03:00.000Z",
      summary: "ClaudeUsage diagnostics export: 3 providers, 1 warnings or failures, 1 recent log events."
    })
  };
}

function createMigrationIpcDependencies(): IpcMigrationDependencies {
  if (!openedDatabase) {
    throw new Error("Database must be open before migration IPC is registered.");
  }

  const database = openedDatabase.database;
  const recordStore = createMigrationRecordStore({ database });
  let cachedCandidates = new Map<string, MigrationSourceCandidate>();

  const createCurrentMigrationService = () =>
    createMigrationService({
      database,
      currentSettings: settings
    });

  return {
    scanSources: (): MigrationScanResult => {
      const candidates = discoverMigrationSources({
        homeDir: app.getPath("home"),
        xdgConfigHome: process.env.XDG_CONFIG_HOME
      });
      cachedCandidates = new Map();

      return {
        scannedAt: new Date().toISOString(),
        candidates: candidates.map((candidate, index) => {
          const candidateId = `${candidate.kind}-${index + 1}`;
          cachedCandidates.set(candidateId, candidate);
          try {
            const plan = createCurrentMigrationService().buildImportPlan(candidate);
            return createMigrationCandidateSummary(candidateId, plan);
          } catch (error) {
            return createMigrationCandidateSummary(candidateId, null, candidate, error);
          }
        })
      };
    },
    runImport: (candidateId: string): MigrationImportUiResult => {
      const candidate = cachedCandidates.get(candidateId);
      if (!candidate) {
        throw new Error("Scan migration sources before running an import.");
      }

      const migrationService = createCurrentMigrationService();
      let plan: MigrationImportPlan;
      try {
        plan = migrationService.buildImportPlan(candidate);
      } catch (error) {
        return createFailedMigrationImportResult(candidate, error);
      }

      const result = migrationService.runImportPlan(plan);
      if (result.failures.length === 0 && hasSettingsPatch(plan)) {
        updateSettings(plan.appSettings);
      }

      return createMigrationImportUiResult(result);
    },
    listRecords: (): MigrationRecordsResult => ({
      generatedAt: new Date().toISOString(),
      records: recordStore.listMigrationRecords().map(createMigrationRecordUiSummary)
    })
  };
}

function createDiagnosticsIpcDependencies() {
  if (!openedDatabase) {
    throw new Error("Database must be open before diagnostics IPC is registered.");
  }

  const diagnosticsService = createDiagnosticsService({
    appName: app.getName(),
    appVersion: app.getVersion(),
    database: openedDatabase.database,
    databasePath: openedDatabase.path,
    getSecretStorageStatus,
    getSettings: () => settings,
    getUsageState: () => usageState,
    platform: process.platform
  });

  return {
    exportDiagnostics: diagnosticsService.exportDiagnostics
  };
}

function updateSettings(patch: AppSettingsPatch): AppSettings {
  const previousLaunchAtLogin = settings.launchAtLogin;
  const overlayPatchKeys = patch.overlay ? Object.keys(patch.overlay) : [];
  settings = appSettingsSchema.parse(mergeAppSettings(settings, patch));

  if (overlayPatchKeys.length === 0 || overlayPatchKeys.some((key) => key !== "bounds")) {
    windowManager?.applyOverlaySettings(settings.overlay);
  }

  if (settings.launchAtLogin !== previousLaunchAtLogin) {
    syncLaunchAtLogin(app, settings.launchAtLogin);
  }

  trayController?.updateState({ settings });

  return settings;
}

function createMigrationCandidateSummary(
  candidateId: string,
  plan: MigrationImportPlan | null,
  candidate?: MigrationSourceCandidate,
  error?: unknown
): MigrationCandidateSummary {
  const sourceKind = plan?.sourceKind ?? candidate?.kind ?? "swift";

  return {
    candidateId,
    sourceKind,
    displayName: formatMigrationSourceName(sourceKind),
    status: plan ? "ready" : "error",
    metadataCounts: plan ? countMigrationPlanMetadata(plan) : emptyMigrationMetadataCounts(),
    skippedSecretCategories: plan?.skippedSecretCategories ?? [],
    warnings: plan?.warnings ?? [],
    error: error ? getErrorMessage(error) : null
  };
}

function createMigrationImportUiResult(result: MigrationImportResult): MigrationImportUiResult {
  return {
    sourceKind: result.sourceKind,
    displayName: formatMigrationSourceName(result.sourceKind),
    status: result.record.status === "pending" ? "skipped" : result.record.status,
    importedAt: result.record.importedAt,
    metadataCounts: result.imported,
    skippedSecretCategories: result.skippedSecretCategories,
    warnings: result.warnings,
    failures: result.failures,
    record: createMigrationRecordUiSummary(result.record)
  };
}

function createFailedMigrationImportResult(
  candidate: MigrationSourceCandidate,
  error: unknown
): MigrationImportUiResult {
  if (!openedDatabase) {
    throw new Error("Database must be open before migration failures are recorded.");
  }

  const sourceKind = candidate.kind;
  const failures = [getErrorMessage(error)];
  const record = createMigrationRecordStore({ database: openedDatabase.database }).recordMigration({
    source: sourceKind,
    status: "failed",
    summary: {
      sourceKind,
      sourcePath: candidate.sourcePath,
      imported: emptyMigrationMetadataCounts(),
      skippedSecretCategories: [],
      warnings: [],
      failures
    }
  });

  return {
    sourceKind,
    displayName: formatMigrationSourceName(sourceKind),
    status: "failed",
    importedAt: record.importedAt,
    metadataCounts: emptyMigrationMetadataCounts(),
    skippedSecretCategories: [],
    warnings: [],
    failures,
    record: createMigrationRecordUiSummary(record)
  };
}

function createMigrationRecordUiSummary(
  record: MigrationImportResult["record"]
): MigrationRecordUiSummary {
  return {
    id: record.id,
    sourceKind: record.source,
    displayName: formatMigrationSourceName(record.source),
    status: record.status,
    importedAt: record.importedAt,
    metadataCounts: record.summary.imported,
    skippedSecretCategories: normalizeSkippedSecretCategories(record.summary.skippedSecretCategories),
    warnings: record.summary.warnings,
    failures: record.summary.failures
  };
}

function countMigrationPlanMetadata(plan: MigrationImportPlan): MigrationMetadataCounts {
  const { providers: _providers, ...appPatch } = plan.appSettings;
  const providerSettings = plan.appSettings.providers ? Object.keys(plan.appSettings.providers).length : 0;

  return {
    accounts: plan.accounts.length,
    historySnapshots: plan.historySnapshots.length,
    appSettings: Object.keys(appPatch).length > 0 ? 1 : 0,
    providerSettings
  };
}

function emptyMigrationMetadataCounts(): MigrationMetadataCounts {
  return {
    accounts: 0,
    historySnapshots: 0,
    appSettings: 0,
    providerSettings: 0
  };
}

function hasSettingsPatch(plan: MigrationImportPlan): boolean {
  return Object.keys(plan.appSettings).length > 0;
}

function normalizeSkippedSecretCategories(categories: readonly string[]): MigrationRecordUiSummary["skippedSecretCategories"] {
  const allowed = new Set<MigrationRecordUiSummary["skippedSecretCategories"][number]>([
    "claude-session-key",
    "github-token",
    "provider-auth-token",
    "api-key",
    "cookie",
    "raw-provider-session",
    "raw-provider-prompt",
    "raw-provider-output"
  ]);

  return categories.filter((category): category is MigrationRecordUiSummary["skippedSecretCategories"][number] =>
    allowed.has(category as MigrationRecordUiSummary["skippedSecretCategories"][number])
  );
}

function formatMigrationSourceName(sourceKind: MigrationSourceCandidate["kind"]): string {
  return sourceKind === "swift" ? "Swift ClaudeUsage app" : "Tauri ClaudeUsage app";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function reportTrayFallback(status: TrayFallbackStatus): void {
  if (!status.warning) {
    return;
  }

  console.warn(status.warning, status.reason);
}

function refreshUsageState(): UsageState {
  const refreshedAt = new Date().toISOString();
  usageState = usageStateSchema.parse({
    ...usageState,
    providers: usageState.providers.map((provider) => ({
      ...provider,
      lastUpdatedAt: refreshedAt
    })),
    lastUpdatedAt: refreshedAt
  });
  trayController?.updateState({ usageState });
  return usageState;
}

function createInitialUsageState(): UsageState {
  if (isSmokeMode) {
    return createSmokeUsageState();
  }

  return usageStateSchema.parse({
    activeProviderId: "claude",
    providers: [
      createPlaceholderProviderCard("claude", "Claude"),
      createPlaceholderProviderCard("codex", "Codex"),
      createPlaceholderProviderCard("gemini", "Gemini")
    ],
    lastUpdatedAt: null,
    warning: getSecretStorageStatus().warning
  });
}

function createSmokeUsageState(): UsageState {
  return usageStateSchema.parse({
    activeProviderId: "claude",
    providers: [
      {
        ...createPlaceholderProviderCard("claude", "Claude"),
        status: "configured",
        headline: "Claude usage is below the five-hour limit",
        detailText: "Resets at 2:00 PM.",
        sessionUtilization: 0.42,
        weeklyUtilization: 0.19,
        resetAt: "2026-04-15T14:00:00.000Z",
        lastUpdatedAt: "2026-04-15T12:00:00.000Z"
      },
      createPlaceholderProviderCard("codex", "Codex"),
      createPlaceholderProviderCard("gemini", "Gemini")
    ],
    lastUpdatedAt: "2026-04-15T12:00:00.000Z",
    warning: getSecretStorageStatus().warning
  });
}

function createPlaceholderProviderCard(providerId: ProviderId, displayName: string): UsageState["providers"][number] {
  return {
    providerId,
    displayName,
    enabled: providerId === "claude",
    status: "missing_configuration",
    confidence: "observed_only",
    headline: `${displayName} not configured`,
    detailText: "Connect storage and provider services in a later phase.",
    sessionUtilization: null,
    weeklyUtilization: null,
    dailyRequestCount: null,
    requestsPerMinute: null,
    resetAt: null,
    lastUpdatedAt: null,
    adapterMode: "passive",
    confidenceExplanation: "Foundation placeholder state only.",
    actions: []
  };
}
