import { BrowserWindow, shell, type BrowserWindowConstructorOptions, type Rectangle } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createDefaultOverlaySettings } from "../shared/settings/defaults.js";
import type { OverlayLayout, OverlaySettings } from "../shared/types/settings.js";

export type AppWindowKind = "popover" | "settings" | "overlay" | "onboarding";

export interface AppWindowDescriptor {
  readonly kind: AppWindowKind;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly route: string;
  readonly options?: BrowserWindowConstructorOptions;
}

export interface AppWindowManagerOptions {
  readonly isDevelopment: boolean;
  readonly devServerUrl: string;
  readonly getOverlaySettings?: () => OverlaySettings;
  readonly updateOverlaySettings?: (patch: Partial<OverlaySettings>) => void;
}

const mainDir = dirname(fileURLToPath(import.meta.url));
const preloadPath = join(mainDir, "../preload/index.js");
const rendererIndexPath = join(mainDir, "../../dist/index.html");
const rendererIndexUrl = pathToFileURL(rendererIndexPath).toString();
const overlayWindowSizes = {
  compact: { width: 320, height: 180 },
  minimal: { width: 240, height: 96 },
  sidebar: { width: 300, height: 560 }
} as const satisfies Record<OverlayLayout, Pick<Rectangle, "width" | "height">>;

export const windowDescriptors: Record<AppWindowKind, AppWindowDescriptor> = {
  popover: {
    kind: "popover",
    title: "ClaudeUsage",
    width: 360,
    height: 480,
    route: "popover",
    options: {
      resizable: false,
      minimizable: false
    }
  },
  settings: {
    kind: "settings",
    title: "ClaudeUsage Settings",
    width: 720,
    height: 620,
    route: "settings"
  },
  overlay: {
    kind: "overlay",
    title: "ClaudeUsage Overlay",
    width: overlayWindowSizes.compact.width,
    height: overlayWindowSizes.compact.height,
    route: "overlay",
    options: {
      alwaysOnTop: true,
      frame: false,
      hasShadow: false,
      skipTaskbar: true,
      transparent: true,
      resizable: false
    }
  },
  onboarding: {
    kind: "onboarding",
    title: "ClaudeUsage Onboarding",
    width: 680,
    height: 560,
    route: "onboarding"
  }
};

export class AppWindowManager {
  private readonly windows = new Map<AppWindowKind, BrowserWindow>();
  private readonly loadPromises = new Map<AppWindowKind, Promise<void>>();

  constructor(private readonly options: AppWindowManagerOptions) {}

  async showPopover(): Promise<BrowserWindow> {
    return this.showWindow("popover");
  }

  async openSettings(): Promise<BrowserWindow> {
    return this.showWindow("settings");
  }

  async openOnboarding(): Promise<BrowserWindow> {
    return this.showWindow("onboarding");
  }

  async toggleOverlay(): Promise<BrowserWindow> {
    const existing = this.windows.get("overlay");

    if (existing?.isVisible()) {
      this.hideOverlay();
      return existing;
    }

    this.options.updateOverlaySettings?.({ enabled: true, visible: true });
    return this.showWindow("overlay");
  }

  hideOverlay(): BrowserWindow | null {
    const overlay = this.windows.get("overlay") ?? null;

    if (overlay && !overlay.isDestroyed()) {
      overlay.hide();
    }

    this.options.updateOverlaySettings?.({ visible: false });
    return overlay;
  }

  applyOverlaySettings(settings: OverlaySettings): void {
    const overlay = this.windows.get("overlay");

    if (!settings.enabled || !settings.visible) {
      overlay?.hide();
      return;
    }

    if (overlay && !overlay.isDestroyed()) {
      this.configureOverlayWindow(overlay, settings);
      overlay.show();
      return;
    }

    void this.showWindow("overlay");
  }

  async focusPrimaryWindow(): Promise<BrowserWindow> {
    const visibleWindow = BrowserWindow.getAllWindows().find((window) => window.isVisible());

    if (visibleWindow) {
      this.restoreAndFocus(visibleWindow);
      return visibleWindow;
    }

    return this.showPopover();
  }

  getWindow(kind: AppWindowKind): BrowserWindow | null {
    return this.windows.get(kind) ?? null;
  }

  dispose(): void {
    for (const window of this.windows.values()) {
      window.removeAllListeners();
      window.destroy();
    }

    this.windows.clear();
  }

  private async showWindow(kind: AppWindowKind): Promise<BrowserWindow> {
    const window = this.getOrCreateWindow(kind);

    await this.ensureWindowLoaded(window, kind);
    this.restoreAndFocus(window);
    return window;
  }

  private getOrCreateWindow(kind: AppWindowKind): BrowserWindow {
    const existing = this.windows.get(kind);

    if (existing && !existing.isDestroyed()) {
      return existing;
    }

    const descriptor = windowDescriptors[kind];
    const overlaySettings = kind === "overlay" ? this.getOverlaySettings() : null;
    const overlayBounds = overlaySettings ? getOverlayInitialBounds(overlaySettings) : null;
    const window = new BrowserWindow({
      title: descriptor.title,
      width: overlayBounds?.width ?? descriptor.width,
      height: overlayBounds?.height ?? descriptor.height,
      x: overlayBounds?.x,
      y: overlayBounds?.y,
      show: false,
      backgroundColor: kind === "overlay" ? "#00000000" : "#111318",
      ...descriptor.options,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        ...(descriptor.options?.webPreferences ?? {})
      }
    });

    window.removeMenu();
    if (kind === "overlay") {
      this.configureOverlayWindow(window, overlaySettings ?? this.getOverlaySettings());
      this.trackOverlayBounds(window);
    }
    window.once("ready-to-show", () => {
      window.show();
    });
    window.on("closed", () => {
      this.windows.delete(kind);
      this.loadPromises.delete(kind);
    });

    this.applyNavigationGuards(window);
    this.windows.set(kind, window);

    return window;
  }

  private async ensureWindowLoaded(window: BrowserWindow, kind: AppWindowKind): Promise<void> {
    if (window.webContents.getURL().length > 0) {
      return;
    }

    const existingLoadPromise = this.loadPromises.get(kind);

    if (existingLoadPromise) {
      await existingLoadPromise;
      return;
    }

    const loadPromise = this.loadWindowContent(window, kind).finally(() => {
      this.loadPromises.delete(kind);
    });
    this.loadPromises.set(kind, loadPromise);
    await loadPromise;
  }

  private async loadWindowContent(window: BrowserWindow, kind: AppWindowKind): Promise<void> {
    const descriptor = windowDescriptors[kind];

    if (this.options.isDevelopment) {
      const url = new URL(this.options.devServerUrl);
      url.hash = descriptor.route;
      await window.loadURL(url.toString());
      return;
    }

    await window.loadFile(rendererIndexPath, {
      hash: descriptor.route
    });
  }

  private restoreAndFocus(window: BrowserWindow): void {
    if (window.isMinimized()) {
      window.restore();
    }

    window.show();
    window.focus();
  }

  private getOverlaySettings(): OverlaySettings {
    return this.options.getOverlaySettings?.() ?? createDefaultOverlaySettings();
  }

  private configureOverlayWindow(window: BrowserWindow, settings: OverlaySettings): void {
    const overlayBounds = getOverlayInitialBounds(settings);

    window.setAlwaysOnTop(true, "floating");
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    window.setOpacity(settings.opacity);

    if (overlayBounds) {
      window.setBounds(overlayBounds);
      return;
    }

    const size = overlayWindowSizes[settings.layout];
    window.setSize(size.width, size.height);
  }

  private trackOverlayBounds(window: BrowserWindow): void {
    const persistBounds = () => {
      this.options.updateOverlaySettings?.({ bounds: normalizeBounds(window.getBounds()) });
    };

    window.on("moved", persistBounds);
    window.on("resized", persistBounds);
  }

  private applyNavigationGuards(window: BrowserWindow): void {
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (isExternalHttpUrl(url)) {
        void shell.openExternal(url);
      }

      return { action: "deny" };
    });

    window.webContents.on("will-navigate", (event, url) => {
      if (this.isAllowedRendererUrl(url)) {
        return;
      }

      event.preventDefault();

      if (isExternalHttpUrl(url)) {
        void shell.openExternal(url);
      }
    });
  }

  private isAllowedRendererUrl(url: string): boolean {
    if (this.options.isDevelopment) {
      return url.startsWith(this.options.devServerUrl);
    }

    return url.startsWith(rendererIndexUrl);
  }
}

function getOverlayInitialBounds(settings: OverlaySettings): Rectangle | null {
  if (!settings.bounds) {
    return null;
  }

  return normalizeBounds(settings.bounds);
}

function normalizeBounds(bounds: Rectangle): Rectangle {
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height)
  };
}

function isExternalHttpUrl(url: string): boolean {
  return url.startsWith("https://") || url.startsWith("http://");
}
