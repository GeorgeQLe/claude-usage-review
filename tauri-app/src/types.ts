export interface UsageLimit {
  utilization: number;
  resets_at: string | null;
}

export interface DisplayLimit {
  name: string;
  utilization: number;
  resets_at: string | null;
  reset_time_display: string | null;
  pace_detail: string | null;
}

export interface AccountInfo {
  id: string;
  name: string;
  is_configured: boolean;
  is_active: boolean;
}

export type AuthStatus = "connected" | "expired" | "not_configured";
export type ErrorState = "auth_expired" | "network_error" | null;

export interface UsageState {
  display_limits: DisplayLimit[];
  tray_color: string;
  menu_bar_text: string;
  accounts: AccountInfo[];
  active_account_id: string | null;
  auth_status: AuthStatus;
  error_state: ErrorState;
  last_updated: string | null;
  highest_utilization: number;
}

export type OverlayLayout = "compact" | "minimal" | "sidebar";
export type TimeDisplayFormat = "reset_time" | "remaining_time";

export interface AppConfig {
  time_display_format: TimeDisplayFormat;
  overlay_enabled: boolean;
  overlay_layout: OverlayLayout;
  overlay_opacity: number;
}
