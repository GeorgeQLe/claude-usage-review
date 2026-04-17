import { Menu, nativeImage, Tray, type MenuItemConstructorOptions, type NativeImage } from "electron";
import { formatTimeDisplay, getSessionPaceStatus, type PaceStatus } from "../shared/formatting/index.js";
import { createDefaultAppSettings } from "../shared/settings/defaults.js";
import type { ProviderCard } from "../shared/types/provider.js";
import type { AppSettings } from "../shared/types/settings.js";
import type { UsageState } from "../shared/types/usage.js";

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
  readonly refreshNow?: () => UsageState | void | Promise<UsageState | void>;
  readonly openSettings: () => void | Promise<void>;
  readonly toggleOverlay: () => void | Promise<void>;
  readonly openOnboarding: () => void | Promise<void>;
  readonly quit: () => void;
  readonly getNow?: () => Date;
  readonly initialState?: Partial<TrayControllerState>;
}

export interface TrayFallbackStatus {
  readonly available: boolean;
  readonly warning: string | null;
  readonly reason: string | null;
}

export type TrayIconState =
  | "normal"
  | "warning"
  | "critical"
  | "limit_hit"
  | "expired"
  | "degraded"
  | "missing_configuration"
  | "unknown";

export interface TrayControllerState {
  readonly usageState: UsageState | null;
  readonly settings: AppSettings;
  readonly isRefreshing: boolean;
}

export interface TrayPresentationState {
  readonly title: string;
  readonly tooltip: string;
  readonly iconState: TrayIconState;
  readonly activeProviderLabel: string;
  readonly resetText: string;
  readonly sessionText: string;
  readonly weeklyText: string;
  readonly overlayChecked: boolean;
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
  private state: TrayControllerState;

  constructor(private readonly options: TrayControllerOptions) {
    this.state = {
      usageState: options.initialState?.usageState ?? null,
      settings: options.initialState?.settings ?? createDefaultAppSettings(),
      isRefreshing: options.initialState?.isRefreshing ?? false
    };
  }

  create(): TrayFallbackStatus {
    const preflightReason = getLinuxPreflightFallbackReason();

    if (preflightReason) {
      this.fallbackStatus = createFallbackStatus(preflightReason);
      return this.fallbackStatus;
    }

    try {
      this.tray = new Tray(createTrayIcon(this.getPresentation().iconState));
      this.applyPresentation();
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

  updateState(patch: Partial<TrayControllerState>): void {
    this.state = {
      usageState: patch.usageState === undefined ? this.state.usageState : patch.usageState,
      settings: patch.settings ?? this.state.settings,
      isRefreshing: patch.isRefreshing ?? this.state.isRefreshing
    };
    this.applyPresentation();
  }

  dispose(): void {
    this.tray?.destroy();
    this.tray = null;
  }

  private getPresentation(): TrayPresentationState {
    return deriveTrayPresentationState({
      ...this.state,
      now: this.options.getNow?.() ?? new Date()
    });
  }

  private applyPresentation(): void {
    if (!this.tray) {
      return;
    }

    const presentation = this.getPresentation();
    this.tray.setImage(createTrayIcon(presentation.iconState));
    this.tray.setToolTip(presentation.tooltip);
    this.tray.setTitle(presentation.title);
    this.tray.setContextMenu(this.createContextMenu(presentation));
  }

  private createContextMenu(presentation: TrayPresentationState = this.getPresentation()): Menu {
    const template: MenuItemConstructorOptions[] = [
      {
        label: presentation.activeProviderLabel
          ? `Show ${presentation.activeProviderLabel} Usage`
          : "Show Usage",
        click: () => {
          void this.options.showPopover();
        }
      },
      {
        label: this.state.isRefreshing ? "Refreshing..." : "Refresh Now",
        enabled: Boolean(this.options.refreshNow) && !this.state.isRefreshing,
        click: () => {
          void this.refreshNow();
        }
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
        type: "checkbox",
        checked: presentation.overlayChecked,
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
        label: presentation.activeProviderLabel
          ? `Select Provider (${presentation.activeProviderLabel})`
          : "Select Provider",
        enabled: false
      },
      ...this.createProviderMenuItems(),
      { type: "separator" },
      {
        label: "Quit",
        click: this.options.quit
      }
    ];

    return Menu.buildFromTemplate(template);
  }

  private createProviderMenuItems(): MenuItemConstructorOptions[] {
    const providers = this.state.usageState?.providers ?? [];
    if (providers.length === 0) {
      return [];
    }

    const activeProviderId = this.state.usageState?.activeProviderId ?? null;
    return providers.map((provider) => ({
      label: formatProviderMenuLabel(provider),
      type: "radio" as const,
      checked: provider.providerId === activeProviderId,
      enabled: false
    }));
  }

  private async refreshNow(): Promise<void> {
    if (!this.options.refreshNow || this.state.isRefreshing) {
      return;
    }

    this.updateState({ isRefreshing: true });
    try {
      const usageState = await this.options.refreshNow();
      if (usageState) {
        this.updateState({ usageState });
      }
    } finally {
      this.updateState({ isRefreshing: false });
    }
  }
}

export function deriveTrayPresentationState(input: TrayControllerState & { readonly now: Date }): TrayPresentationState {
  const provider = getActiveProvider(input.usageState);
  const resetText = provider?.resetAt
    ? formatResetLabel({
        resetAt: provider.resetAt,
        settings: input.settings,
        now: input.now
      })
    : "";
  const sessionText = formatUtilization(provider?.sessionUtilization ?? null);
  const weeklyText = formatUtilization(provider?.weeklyUtilization ?? null);
  const iconState = deriveTrayIconState(provider, input.usageState?.warning ?? null, input.now);
  const activeProviderLabel = provider?.displayName ?? "Claude";
  const titleParts = [formatTrayTitle(provider, activeProviderLabel, sessionText), resetText].filter(Boolean);
  const tooltipLines = buildTooltipLines({
    activeProviderLabel,
    provider,
    resetText,
    sessionText,
    usageState: input.usageState,
    weeklyText
  });

  return {
    title: titleParts.join(" "),
    tooltip: tooltipLines.join("\n"),
    iconState,
    activeProviderLabel,
    resetText,
    sessionText,
    weeklyText,
    overlayChecked: input.settings.overlay.enabled && input.settings.overlay.visible
  };
}

export function syncLaunchAtLogin(
  appApi: Pick<Electron.App, "getLoginItemSettings" | "setLoginItemSettings">,
  enabled: boolean
): boolean {
  try {
    const current = appApi.getLoginItemSettings();
    if (current.openAtLogin === enabled) {
      return false;
    }

    appApi.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true
    });
    return true;
  } catch (error) {
    console.warn("Failed to update launch-at-login setting.", error);
    return false;
  }
}

export function createTrayIcon(state: TrayIconState = "normal"): NativeImage {
  const colors = getTrayIconColors(state);
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">',
    `<rect width="32" height="32" rx="8" fill="${colors.background}"/>`,
    `<path d="M10 21.5 16 8l6 13.5h-3.4l-1-2.6h-3.3l-1 2.6H10Zm5.2-5.1h1.6L16 14.1l-.8 2.3Z" fill="${colors.foreground}"/>`,
    "</svg>"
  ].join("");
  const image = nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);

  if (process.platform === "darwin") {
    image.setTemplateImage(true);
  }

  return image;
}

function getActiveProvider(usageState: UsageState | null): ProviderCard | null {
  if (!usageState) {
    return null;
  }

  return (
    usageState.providers.find((provider) => provider.providerId === usageState.activeProviderId) ??
    usageState.providers.find((provider) => provider.providerId === "claude") ??
    usageState.providers.find((provider) => provider.enabled) ??
    usageState.providers[0] ??
    null
  );
}

function formatResetLabel(input: {
  readonly resetAt: string;
  readonly settings: AppSettings;
  readonly now: Date;
}): string {
  const value = formatTimeDisplay({
    format: input.settings.timeDisplay,
    resetAt: input.resetAt,
    now: input.now
  });

  if (!value) {
    return "";
  }

  return input.settings.timeDisplay === "reset-time" ? `Resets at ${value}` : `Resets in ${value}`;
}

function formatUtilization(value: number | null): string {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value * 100)}%` : "Pending";
}

function formatTrayTitle(provider: ProviderCard | null, activeProviderLabel: string, sessionText: string): string {
  if (!provider) {
    return activeProviderLabel;
  }

  if (provider.providerId === "claude") {
    return sessionText === "Pending" ? activeProviderLabel : sessionText;
  }

  return `${activeProviderLabel} ${formatPassiveCompactMetric(provider)}`;
}

function buildTooltipLines(input: {
  readonly activeProviderLabel: string;
  readonly provider: ProviderCard | null;
  readonly resetText: string;
  readonly sessionText: string;
  readonly usageState: UsageState | null;
  readonly weeklyText: string;
}): readonly string[] {
  const baseLines = [
    `${input.activeProviderLabel}: ${formatTrayStatus(input.provider, input.usageState?.warning ?? null)}`
  ];

  const metricLines =
    input.provider?.providerId === "claude"
      ? [`Session ${input.sessionText} | Weekly ${input.weeklyText}`, input.resetText]
      : [
          formatPassiveMetricLine(input.provider),
          input.provider?.confidenceExplanation ?? "",
          input.provider?.detailText ?? ""
        ];

  return [
    ...baseLines,
    ...metricLines,
    input.usageState?.lastUpdatedAt ? `Updated ${formatShortDateTime(input.usageState.lastUpdatedAt)}` : "Waiting for refresh",
    input.usageState?.warning ?? ""
  ].filter(Boolean);
}

function formatPassiveCompactMetric(provider: ProviderCard): string {
  if (typeof provider.dailyRequestCount === "number") {
    return `${provider.dailyRequestCount} today`;
  }

  if (typeof provider.requestsPerMinute === "number") {
    return `${provider.requestsPerMinute}/min`;
  }

  return formatProviderStatusToken(provider.status);
}

function formatPassiveMetricLine(provider: ProviderCard | null): string {
  if (!provider) {
    return "";
  }

  const metrics = [
    typeof provider.dailyRequestCount === "number" ? `${provider.dailyRequestCount} requests today` : "",
    typeof provider.requestsPerMinute === "number" ? `${provider.requestsPerMinute}/min` : "",
    provider.resetAt ? `Reset ${formatShortDateTime(provider.resetAt)}` : ""
  ].filter(Boolean);

  return metrics.length > 0 ? metrics.join(" | ") : formatProviderStatusToken(provider.status);
}

function formatProviderMenuLabel(provider: ProviderCard): string {
  return `${provider.displayName} - ${formatPassiveCompactMetric(provider)}`;
}

function deriveTrayIconState(provider: ProviderCard | null, warning: string | null, now: Date): TrayIconState {
  if (!provider) {
    return "unknown";
  }

  if (provider.status === "missing_configuration") {
    return "missing_configuration";
  }
  if (provider.status === "expired") {
    return "expired";
  }
  if (provider.status === "degraded" || provider.status === "stale" || warning) {
    return "degraded";
  }

  const usageStatus = deriveUsageStatus(provider, now);
  switch (usageStatus) {
    case "limit_hit":
      return "limit_hit";
    case "critical":
      return "critical";
    case "warning":
      return "warning";
    case "unknown":
      return "unknown";
    case "behind_pace":
    case "on_track":
    case "way_behind":
      return "normal";
  }
}

function deriveUsageStatus(provider: ProviderCard, now: Date): PaceStatus {
  if (provider.sessionUtilization !== null) {
    const sessionStatus = getSessionPaceStatus(
      {
        utilization: provider.sessionUtilization * 100,
        resetsAt: provider.resetAt
      },
      now
    );
    if (sessionStatus === "limit_hit" || sessionStatus === "critical" || sessionStatus === "warning") {
      return sessionStatus;
    }
  }

  if (provider.weeklyUtilization !== null) {
    if (provider.weeklyUtilization >= 1) {
      return "limit_hit";
    }
    if (provider.weeklyUtilization >= 0.95) {
      return "critical";
    }
    if (provider.weeklyUtilization >= 0.8) {
      return "warning";
    }
  }

  return "on_track";
}

function formatTrayStatus(provider: ProviderCard | null, warning: string | null): string {
  if (warning) {
    return "Needs attention";
  }
  if (!provider) {
    return "Waiting for provider state";
  }
  if (provider.status === "configured") {
    return provider.providerId === "claude" ? "Configured" : `${provider.displayName} usage is derived from local activity`;
  }

  return provider.status.replace(/_/gu, " ");
}

function formatProviderStatusToken(status: ProviderCard["status"]): string {
  return status
    .split(/_/u)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function formatShortDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function getTrayIconColors(state: TrayIconState): { readonly background: string; readonly foreground: string } {
  switch (state) {
    case "normal":
      return { background: "#14532d", foreground: "#f8fafc" };
    case "warning":
      return { background: "#b45309", foreground: "#fff7ed" };
    case "critical":
      return { background: "#b91c1c", foreground: "#fff1f2" };
    case "limit_hit":
      return { background: "#111827", foreground: "#f9fafb" };
    case "expired":
      return { background: "#7f1d1d", foreground: "#fee2e2" };
    case "degraded":
      return { background: "#4b5563", foreground: "#f9fafb" };
    case "missing_configuration":
      return { background: "#6b7280", foreground: "#f9fafb" };
    case "unknown":
      return { background: "#1f2937", foreground: "#f9fafb" };
  }
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
