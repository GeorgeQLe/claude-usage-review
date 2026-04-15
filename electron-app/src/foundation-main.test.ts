import { afterEach, describe, expect, it, vi } from "vitest";

const electronMock = vi.hoisted(() => {
  class MockBrowserWindow {
    static instances: MockBrowserWindow[] = [];
    static getAllWindows = vi.fn(() => MockBrowserWindow.instances);

    readonly options: Record<string, unknown>;
    readonly webContents = {
      getURL: vi.fn(() => this.url),
      on: vi.fn(),
      send: vi.fn(),
      setWindowOpenHandler: vi.fn()
    };
    readonly removeMenu = vi.fn();
    readonly once = vi.fn((event: string, handler: () => void) => {
      this.onceHandlers.set(event, handler);
    });
    readonly on = vi.fn((event: string, handler: () => void) => {
      this.handlers.set(event, handler);
    });
    readonly loadURL = vi.fn(async (url: string) => {
      this.url = url;
      this.onceHandlers.get("ready-to-show")?.();
    });
    readonly loadFile = vi.fn(async (path: string, options?: { readonly hash?: string }) => {
      this.url = `${path}#${options?.hash ?? ""}`;
      this.onceHandlers.get("ready-to-show")?.();
    });
    readonly show = vi.fn(() => {
      this.visible = true;
    });
    readonly focus = vi.fn();
    readonly hide = vi.fn(() => {
      this.visible = false;
    });
    readonly restore = vi.fn(() => {
      this.minimized = false;
    });
    readonly isMinimized = vi.fn(() => this.minimized);
    readonly isVisible = vi.fn(() => this.visible);
    readonly isDestroyed = vi.fn(() => this.destroyed);
    readonly removeAllListeners = vi.fn();
    readonly destroy = vi.fn(() => {
      this.destroyed = true;
    });

    private readonly handlers = new Map<string, () => void>();
    private readonly onceHandlers = new Map<string, () => void>();
    private url = "";
    private visible = false;
    private minimized = false;
    private destroyed = false;

    constructor(options: Record<string, unknown>) {
      this.options = options;
      MockBrowserWindow.instances.push(this);
    }
  }

  class MockTray {
    static instances: MockTray[] = [];

    readonly destroy = vi.fn();
    readonly on = vi.fn();
    readonly setContextMenu = vi.fn();
    readonly setToolTip = vi.fn();

    constructor(readonly image: unknown) {
      MockTray.instances.push(this);
    }
  }

  return {
    BrowserWindow: MockBrowserWindow,
    Menu: {
      buildFromTemplate: vi.fn((template: unknown[]) => ({ template }))
    },
    Tray: MockTray,
    nativeImage: {
      createFromDataURL: vi.fn(() => ({
        setTemplateImage: vi.fn()
      }))
    },
    shell: {
      openExternal: vi.fn()
    }
  };
});

vi.mock("electron", () => electronMock);

describe("foundation window routing", () => {
  afterEach(() => {
    electronMock.BrowserWindow.instances.length = 0;
    vi.clearAllMocks();
  });

  it("defines the expected foundation window routes", async () => {
    const { windowDescriptors } = await import("./main/windows.js");

    expect(Object.keys(windowDescriptors)).toEqual(["popover", "settings", "overlay", "onboarding"]);
    expect(Object.values(windowDescriptors).map((descriptor) => descriptor.route)).toEqual([
      "popover",
      "settings",
      "overlay",
      "onboarding"
    ]);
  });

  it("creates development renderer windows with secure webPreferences and route hashes", async () => {
    const { AppWindowManager } = await import("./main/windows.js");
    const manager = new AppWindowManager({
      devServerUrl: "http://127.0.0.1:5173/",
      isDevelopment: true
    });

    await manager.showPopover();

    const window = electronMock.BrowserWindow.instances[0];
    expect(window?.loadURL).toHaveBeenCalledWith("http://127.0.0.1:5173/#popover");
    expect(window?.removeMenu).toHaveBeenCalled();
    expect(window?.show).toHaveBeenCalled();
    expect(window?.focus).toHaveBeenCalled();
    expect(window?.webContents.setWindowOpenHandler).toHaveBeenCalled();
    expect(window?.options).toMatchObject({
      show: false,
      webPreferences: {
        allowRunningInsecureContent: false,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true
      }
    });
    expect(String((window?.options.webPreferences as Record<string, unknown>).preload)).toContain("preload/index.js");
  });

  it("toggles the overlay window instead of creating duplicate overlay instances", async () => {
    const { AppWindowManager } = await import("./main/windows.js");
    const manager = new AppWindowManager({
      devServerUrl: "http://127.0.0.1:5173/",
      isDevelopment: true
    });

    const firstOverlay = await manager.toggleOverlay();
    const secondOverlay = await manager.toggleOverlay();

    expect(firstOverlay).toBe(secondOverlay);
    expect(electronMock.BrowserWindow.instances).toHaveLength(1);
    expect(electronMock.BrowserWindow.instances[0]?.hide).toHaveBeenCalled();
  });
});

describe("foundation tray routing", () => {
  afterEach(() => {
    electronMock.Tray.instances.length = 0;
    vi.clearAllMocks();
  });

  it("keeps the tray skeleton aligned with the foundation actions", async () => {
    const { trayMenuSkeleton } = await import("./main/tray.js");

    expect(trayMenuSkeleton.map((item) => item.action)).toEqual([
      "show-popover",
      "refresh-now",
      "open-settings",
      "toggle-overlay",
      "pause-rotation",
      "select-provider",
      "open-onboarding",
      "quit"
    ]);
  });

  it("routes enabled tray menu items to window and app actions", async () => {
    const { TrayController } = await import("./main/tray.js");
    const showPopover = vi.fn();
    const openSettings = vi.fn();
    const toggleOverlay = vi.fn();
    const openOnboarding = vi.fn();
    const quit = vi.fn();
    const controller = new TrayController({ openOnboarding, openSettings, quit, showPopover, toggleOverlay });

    const status = controller.create();
    const template = electronMock.Menu.buildFromTemplate.mock.calls[0]?.[0] as Array<{
      readonly label?: string;
      readonly click?: () => void;
    }>;

    template.find((item) => item.label === "Show Usage")?.click?.();
    template.find((item) => item.label === "Open Settings")?.click?.();
    template.find((item) => item.label === "Toggle Overlay")?.click?.();
    template.find((item) => item.label === "Onboarding")?.click?.();
    template.find((item) => item.label === "Quit")?.click?.();

    expect(status).toEqual({ available: true, reason: null, warning: null });
    expect(electronMock.Tray.instances[0]?.setToolTip).toHaveBeenCalledWith("ClaudeUsage");
    expect(electronMock.Tray.instances[0]?.setContextMenu).toHaveBeenCalled();
    expect(showPopover).toHaveBeenCalledTimes(1);
    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(toggleOverlay).toHaveBeenCalledTimes(1);
    expect(openOnboarding).toHaveBeenCalledTimes(1);
    expect(quit).toHaveBeenCalledTimes(1);
  });
});
