import type { AppSettings, AppSettingsPatch, OverlaySettings } from "../types/settings.js";

export function createDefaultOverlaySettings(): OverlaySettings {
  return {
    enabled: false,
    visible: false,
    layout: "compact",
    opacity: 0.9,
    bounds: null
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
      codex: {
        enabled: false,
        setupPromptDismissed: false
      },
      gemini: {
        enabled: false,
        setupPromptDismissed: false
      }
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
    providers: patch.providers
      ? {
          codex: patch.providers.codex ? { ...settings.providers.codex, ...patch.providers.codex } : settings.providers.codex,
          gemini: patch.providers.gemini
            ? { ...settings.providers.gemini, ...patch.providers.gemini }
            : settings.providers.gemini
        }
      : settings.providers,
    migration: patch.migration ? { ...settings.migration, ...patch.migration } : settings.migration,
    notifications: patch.notifications ? { ...settings.notifications, ...patch.notifications } : settings.notifications,
    onboarding: patch.onboarding ? { ...settings.onboarding, ...patch.onboarding } : settings.onboarding
  };
}
