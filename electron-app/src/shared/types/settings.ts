export type TimeDisplayMode = "countdown" | "reset-time";

export type PaceTheme = "balanced" | "strict" | "relaxed";

export type WeeklyColorMode = "pace-aware" | "raw-percentage";

export type OverlayLayout = "compact" | "minimal" | "sidebar";

export interface OverlaySettings {
  readonly enabled: boolean;
  readonly layout: OverlayLayout;
  readonly opacity: number;
}

export interface ProviderPlaceholderSettings {
  readonly enabled: boolean;
  readonly setupPromptDismissed: boolean;
}

export interface ProviderPlaceholderMap {
  readonly codex: ProviderPlaceholderSettings;
  readonly gemini: ProviderPlaceholderSettings;
}

export interface MigrationPromptSettings {
  readonly swiftAppImport: boolean;
  readonly providerImport: boolean;
}

export interface NotificationSettings {
  readonly enabled: boolean;
  readonly sessionReset: boolean;
  readonly weeklyReset: boolean;
  readonly authExpired: boolean;
  readonly providerDegraded: boolean;
  readonly thresholdWarnings: boolean;
  readonly sessionWarningPercent: number;
  readonly weeklyWarningPercent: number;
}

export interface OnboardingSettings {
  readonly completed: boolean;
  readonly skipped: boolean;
}

export interface AppSettings {
  readonly launchAtLogin: boolean;
  readonly timeDisplay: TimeDisplayMode;
  readonly paceTheme: PaceTheme;
  readonly weeklyColorMode: WeeklyColorMode;
  readonly overlay: OverlaySettings;
  readonly providers: ProviderPlaceholderMap;
  readonly migration: MigrationPromptSettings;
  readonly notifications: NotificationSettings;
  readonly onboarding: OnboardingSettings;
}

export interface AppSettingsPatch
  extends Partial<Omit<AppSettings, "overlay" | "providers" | "migration" | "notifications" | "onboarding">> {
  readonly overlay?: Partial<OverlaySettings>;
  readonly providers?: {
    readonly codex?: Partial<ProviderPlaceholderSettings>;
    readonly gemini?: Partial<ProviderPlaceholderSettings>;
  };
  readonly migration?: Partial<MigrationPromptSettings>;
  readonly notifications?: Partial<NotificationSettings>;
  readonly onboarding?: Partial<OnboardingSettings>;
}
