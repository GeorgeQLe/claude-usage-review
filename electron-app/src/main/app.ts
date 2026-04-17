import { app } from "electron";
import { AppWindowManager } from "./windows.js";
import { runElectronSmokeSuite } from "./smoke.js";
import { syncLaunchAtLogin, TrayController, type TrayFallbackStatus } from "./tray.js";
import { registerIpcHandlers, type IpcRegistration } from "./ipc.js";
import { createLocalNotificationService, type LocalNotificationService } from "./services/notifications.js";
import { getSecretStorageStatus } from "./storage/secrets.js";
import { createWrapperGenerationService } from "./wrappers/generator.js";
import { createWrapperVerificationService } from "./wrappers/verification.js";
import { createDefaultAppSettings, mergeAppSettings } from "../shared/settings/defaults.js";
import { appSettingsSchema } from "../shared/schemas/settings.js";
import { usageStateSchema } from "../shared/schemas/usage.js";
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
