export type AppWindowKind = "popover" | "settings" | "overlay" | "onboarding";

export interface AppWindowDescriptor {
  readonly kind: AppWindowKind;
  readonly title: string;
  readonly width: number;
  readonly height: number;
}

export const windowDescriptors: Record<AppWindowKind, AppWindowDescriptor> = {
  popover: {
    kind: "popover",
    title: "ClaudeUsage",
    width: 360,
    height: 480
  },
  settings: {
    kind: "settings",
    title: "ClaudeUsage Settings",
    width: 720,
    height: 620
  },
  overlay: {
    kind: "overlay",
    title: "ClaudeUsage Overlay",
    width: 320,
    height: 160
  },
  onboarding: {
    kind: "onboarding",
    title: "ClaudeUsage Onboarding",
    width: 680,
    height: 560
  }
};
