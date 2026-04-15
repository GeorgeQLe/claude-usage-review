import { Menu, nativeImage, Tray, type MenuItemConstructorOptions, type NativeImage } from "electron";

export type TrayAction =
  | "refresh-now"
  | "open-settings"
  | "toggle-overlay"
  | "pause-rotation"
  | "select-provider"
  | "open-onboarding"
  | "show-popover"
  | "quit";

export interface TrayMenuItemDescriptor {
  readonly action: TrayAction;
  readonly label: string;
}

export interface TrayControllerOptions {
  readonly showPopover: () => void | Promise<void>;
  readonly openSettings: () => void | Promise<void>;
  readonly toggleOverlay: () => void | Promise<void>;
  readonly openOnboarding: () => void | Promise<void>;
  readonly quit: () => void;
}

export interface TrayFallbackStatus {
  readonly available: boolean;
  readonly warning: string | null;
  readonly reason: string | null;
}

export const trayMenuSkeleton: readonly TrayMenuItemDescriptor[] = [
  { action: "show-popover", label: "Show Usage" },
  { action: "refresh-now", label: "Refresh Now" },
  { action: "open-settings", label: "Open Settings" },
  { action: "toggle-overlay", label: "Toggle Overlay" },
  { action: "pause-rotation", label: "Pause Rotation" },
  { action: "select-provider", label: "Select Provider" },
  { action: "open-onboarding", label: "Onboarding" },
  { action: "quit", label: "Quit" }
];

const defaultFallbackStatus: TrayFallbackStatus = {
  available: true,
  warning: null,
  reason: null
};

export class TrayController {
  private tray: Tray | null = null;
  private fallbackStatus: TrayFallbackStatus = defaultFallbackStatus;

  constructor(private readonly options: TrayControllerOptions) {}

  create(): TrayFallbackStatus {
    const preflightReason = getLinuxPreflightFallbackReason();

    if (preflightReason) {
      this.fallbackStatus = createFallbackStatus(preflightReason);
      return this.fallbackStatus;
    }

    try {
      this.tray = new Tray(createTrayIcon());
      this.tray.setToolTip("ClaudeUsage");
      this.tray.setContextMenu(this.createContextMenu());
      this.tray.on("click", () => {
        void this.options.showPopover();
      });
      this.fallbackStatus = defaultFallbackStatus;
      return this.fallbackStatus;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.fallbackStatus = createFallbackStatus(reason);
      return this.fallbackStatus;
    }
  }

  getFallbackStatus(): TrayFallbackStatus {
    return this.fallbackStatus;
  }

  dispose(): void {
    this.tray?.destroy();
    this.tray = null;
  }

  private createContextMenu(): Menu {
    const template: MenuItemConstructorOptions[] = [
      {
        label: "Show Usage",
        click: () => {
          void this.options.showPopover();
        }
      },
      {
        label: "Refresh Now",
        enabled: false
      },
      { type: "separator" },
      {
        label: "Open Settings",
        click: () => {
          void this.options.openSettings();
        }
      },
      {
        label: "Toggle Overlay",
        click: () => {
          void this.options.toggleOverlay();
        }
      },
      {
        label: "Onboarding",
        click: () => {
          void this.options.openOnboarding();
        }
      },
      { type: "separator" },
      {
        label: "Pause Rotation",
        enabled: false
      },
      {
        label: "Select Provider",
        enabled: false
      },
      { type: "separator" },
      {
        label: "Quit",
        click: this.options.quit
      }
    ];

    return Menu.buildFromTemplate(template);
  }
}

export function createTrayIcon(): NativeImage {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">',
    '<rect width="32" height="32" rx="8" fill="#111318"/>',
    '<path d="M10 21.5 16 8l6 13.5h-3.4l-1-2.6h-3.3l-1 2.6H10Zm5.2-5.1h1.6L16 14.1l-.8 2.3Z" fill="#f5f7fa"/>',
    "</svg>"
  ].join("");
  const image = nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);

  if (process.platform === "darwin") {
    image.setTemplateImage(true);
  }

  return image;
}

function getLinuxPreflightFallbackReason(): string | null {
  if (process.platform !== "linux") {
    return null;
  }

  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    return "No Linux graphical session was detected for tray creation.";
  }

  return null;
}

function createFallbackStatus(reason: string): TrayFallbackStatus {
  const warning =
    process.platform === "linux"
      ? "System tray integration is unavailable; ClaudeUsage will continue with window-based controls."
      : "System tray integration is unavailable.";

  return {
    available: false,
    warning,
    reason
  };
}
