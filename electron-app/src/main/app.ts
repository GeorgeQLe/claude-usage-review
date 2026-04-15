import { app } from "electron";
import { AppWindowManager } from "./windows.js";
import { TrayController, type TrayFallbackStatus } from "./tray.js";

const isDevelopment = !app.isPackaged;
const rendererDevServerUrl = process.env.ELECTRON_RENDERER_URL ?? "http://127.0.0.1:5173";

let windowManager: AppWindowManager | null = null;
let trayController: TrayController | null = null;
let isQuitting = false;

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
  windowManager = new AppWindowManager({
    isDevelopment,
    devServerUrl: rendererDevServerUrl
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
}

function reportTrayFallback(status: TrayFallbackStatus): void {
  if (!status.warning) {
    return;
  }

  console.warn(status.warning, status.reason);
}
