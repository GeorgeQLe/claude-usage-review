import type { AppSettings, AppSettingsPatch, OverlaySettings, ProviderPlaceholderSettings } from "../types/settings.js";

export function createDefaultOverlaySettings(): OverlaySettings {
  return {
    enabled: false,
    visible: false,
    layout: "compact",
    opacity: 0.9,
    bounds: null
  };
}

export function createDefaultProviderSettings(): ProviderPlaceholderSettings {
  return {
    enabled: false,
    setupPromptDismissed: false,
    adapterMode: "passive",
    authMode: "unknown",
    plan: "unknown",
    profileLabel: null,
    lastRefreshAt: null,
    staleAfterMinutes: 30
  };
}

export function createDefaultAppSettings(): AppSettings {
  return {
    launchAtLogin: false,
    timeDisplay: "countdown",
    paceTheme: "balanced",
    weeklyColorMode: "pace-aware",
    overlay: createDefaultOverlaySettings(),
    providers: {
      codex: createDefaultProviderSettings(),
      gemini: createDefaultProviderSettings()
    },
    migration: {
      swiftAppImport: true,
      providerImport: true
    },
    notifications: {
      enabled: true,
      sessionReset: true,
      weeklyReset: true,
      authExpired: true,
      providerDegraded: false,
      thresholdWarnings: true,
      sessionWarningPercent: 80,
      weeklyWarningPercent: 80
    },
    onboarding: {
      completed: false,
      skipped: false
    }
  };
}

export function mergeAppSettings(settings: AppSettings, patch: AppSettingsPatch): AppSettings {
  return {
    ...settings,
    ...patch,
    overlay: patch.overlay ? { ...settings.overlay, ...patch.overlay } : settings.overlay,
    providers: patch.providers ? mergeProviderSettings(settings.providers, patch.providers) : settings.providers,
    migration: patch.migration ? { ...settings.migration, ...patch.migration } : settings.migration,
    notifications: patch.notifications ? { ...settings.notifications, ...patch.notifications } : settings.notifications,
    onboarding: patch.onboarding ? { ...settings.onboarding, ...patch.onboarding } : settings.onboarding
  };
}

function mergeProviderSettings(
  settings: AppSettings["providers"],
  patch: NonNullable<AppSettingsPatch["providers"]>
): AppSettings["providers"] {
  return {
    codex: patch.codex ? { ...settings.codex, ...patch.codex } : settings.codex,
    gemini: patch.gemini ? { ...settings.gemini, ...patch.gemini } : settings.gemini
  };
}
