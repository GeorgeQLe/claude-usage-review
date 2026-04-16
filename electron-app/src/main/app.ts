import { app } from "electron";
import { AppWindowManager } from "./windows.js";
import { TrayController, type TrayFallbackStatus } from "./tray.js";
import { registerIpcHandlers, type IpcRegistration } from "./ipc.js";
import { createLocalNotificationService, type LocalNotificationService } from "./services/notifications.js";
import { createDefaultAppSettings, mergeAppSettings } from "../shared/settings/defaults.js";
import { appSettingsSchema } from "../shared/schemas/settings.js";
import type { AppSettings, AppSettingsPatch } from "../shared/types/settings.js";

const isSmokeMode = process.env.CLAUDE_USAGE_ELECTRON_SMOKE === "1";
const isDevelopment = !app.isPackaged && !isSmokeMode;
const rendererDevServerUrl = process.env.ELECTRON_RENDERER_URL ?? "http://127.0.0.1:5173";

let windowManager: AppWindowManager | null = null;
let trayController: TrayController | null = null;
let ipcRegistration: IpcRegistration | null = null;
let notificationService: LocalNotificationService | null = null;
let isQuitting = false;
let settings = appSettingsSchema.parse(createDefaultAppSettings());

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

  windowManager = new AppWindowManager({
    isDevelopment,
    devServerUrl: rendererDevServerUrl,
    getOverlaySettings: () => settings.overlay,
    updateOverlaySettings: (patch) => {
      updateSettings({ overlay: patch });
    }
  });

  ipcRegistration = registerIpcHandlers({
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
    }
  });

  const trayStatus = trayController.create();
  reportTrayFallback(trayStatus);
  await windowManager.showPopover();

  if (isSmokeMode) {
    console.log("CLAUDE_USAGE_ELECTRON_SMOKE_OK");
    setTimeout(() => {
      isQuitting = true;
      app.quit();
    }, 50);
  }
}

function updateSettings(patch: AppSettingsPatch): AppSettings {
  const overlayPatchKeys = patch.overlay ? Object.keys(patch.overlay) : [];
  settings = appSettingsSchema.parse(mergeAppSettings(settings, patch));

  if (overlayPatchKeys.length === 0 || overlayPatchKeys.some((key) => key !== "bounds")) {
    windowManager?.applyOverlaySettings(settings.overlay);
  }

  return settings;
}

function reportTrayFallback(status: TrayFallbackStatus): void {
  if (!status.warning) {
    return;
  }

  console.warn(status.warning, status.reason);
}
