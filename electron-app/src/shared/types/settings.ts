export type TimeDisplayMode = "countdown" | "reset-time";

export type PaceTheme = "balanced" | "strict" | "relaxed";

export type WeeklyColorMode = "pace-aware" | "raw-percentage";

export type OverlayLayout = "compact" | "minimal" | "sidebar";

export interface OverlaySettings {
  readonly enabled: boolean;
  readonly layout: OverlayLayout;
  readonly opacity: number;
}

export interface AppSettings {
  readonly launchAtLogin: boolean;
  readonly timeDisplay: TimeDisplayMode;
  readonly paceTheme: PaceTheme;
  readonly weeklyColorMode: WeeklyColorMode;
  readonly overlay: OverlaySettings;
}

export interface AppSettingsPatch extends Partial<Omit<AppSettings, "overlay">> {
  readonly overlay?: Partial<OverlaySettings>;
}
