export type TrayAction =
  | "refresh-now"
  | "open-settings"
  | "toggle-overlay"
  | "pause-rotation"
  | "select-provider"
  | "quit";

export interface TrayMenuItemDescriptor {
  readonly action: TrayAction;
  readonly label: string;
}

export const trayMenuSkeleton: readonly TrayMenuItemDescriptor[] = [
  { action: "refresh-now", label: "Refresh Now" },
  { action: "open-settings", label: "Open Settings" },
  { action: "toggle-overlay", label: "Toggle Overlay" },
  { action: "pause-rotation", label: "Pause Rotation" },
  { action: "select-provider", label: "Select Provider" },
  { action: "quit", label: "Quit" }
];
