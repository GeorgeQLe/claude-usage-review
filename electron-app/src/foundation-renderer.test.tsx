import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingRoute } from "./renderer/onboarding/index.js";
import { OverlayRoute } from "./renderer/overlay/index.js";
import { SettingsRoute } from "./renderer/settings/index.js";
import type { AccountSummary } from "./shared/types/accounts.js";
import type { GitHubHeatmapResult } from "./shared/types/ipc.js";
import type { AppSettings } from "./shared/types/settings.js";
import type { UsageState } from "./shared/types/usage.js";

window.__CLAUDE_USAGE_SKIP_AUTO_MOUNT__ = true;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("foundation renderer routes", () => {
  let roots: Root[] = [];

  beforeEach(() => {
    document.body.innerHTML = "";
    window.claudeUsage = createMockPreloadApi();
    roots = [];
  });

  afterEach(async () => {
    for (const root of roots) {
      await act(async () => {
        root.unmount();
      });
    }
    vi.clearAllMocks();
  });

  it("resolves unknown hashes to the popover route", async () => {
    const { getRouteFromHash } = await importRendererApp();

    expect(getRouteFromHash("#settings")).toBe("settings");
    expect(getRouteFromHash("#overlay")).toBe("overlay");
    expect(getRouteFromHash("#unexpected")).toBe("popover");
  });

  it("mounts the popover route through the preload API", async () => {
    const { PopoverRoute } = await importRendererApp();

    await renderRoute(<PopoverRoute />);

    expect(document.body.textContent).toContain("Usage overview");
    expect(document.body.textContent).toContain("Five-hour usage");
    expect(document.body.textContent).toContain("42%");
    expect(document.body.textContent).toContain("Local placeholder");
    expect(window.claudeUsage.getUsageState).toHaveBeenCalled();
    expect(window.claudeUsage.subscribeUsageUpdated).toHaveBeenCalled();
  });

  it("renders configured GitHub heatmap state without credential material", async () => {
    const { PopoverRoute } = await importRendererApp();
    window.claudeUsage.getGitHubHeatmap = vi.fn(async () => configuredGitHubHeatmap);

    const { container } = await renderRoute(<PopoverRoute />);

    expect(document.body.textContent).toContain("GitHub Contributions");
    expect(document.body.textContent).toContain("Updated");
    expect(document.body.textContent).toContain("12 contributions");
    expect(container.querySelector('[aria-label="2026-04-15: 7 contributions"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain("ghp_");
  });

  it("mounts settings with account controls and write-only Claude credentials", async () => {
    const { container } = await renderRoute(<SettingsRoute />);
    const accountInput = container.querySelector<HTMLInputElement>('input[name="account-label"]');
    const renameInput = container.querySelector<HTMLInputElement>('input[name="rename-local-placeholder"]');
    const sessionInput = container.querySelector<HTMLInputElement>('input[name="session-key"]');
    const orgInput = container.querySelector<HTMLInputElement>('input[name="org-id"]');
    const timeSelect = container.querySelector<HTMLSelectElement>('select[name="time-display"]');

    expect(document.body.textContent).toContain("Account and display");
    expect(accountInput).not.toBeNull();
    expect(renameInput).not.toBeNull();
    expect(sessionInput).not.toBeNull();
    expect(orgInput).not.toBeNull();
    expect(timeSelect).not.toBeNull();

    await act(async () => {
      if (timeSelect) {
        setSelectValue(timeSelect, "reset-time");
      }
    });
    await act(async () => {
      timeSelect?.closest("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(window.claudeUsage.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        timeDisplay: "reset-time",
        providers: expect.objectContaining({
          codex: expect.objectContaining({ enabled: false }),
          gemini: expect.objectContaining({ enabled: false })
        }),
        notifications: expect.objectContaining({ sessionWarningPercent: 80 })
      })
    );

    await act(async () => {
      if (accountInput) {
        setInputValue(accountInput, "Personal");
      }
    });
    await act(async () => {
      accountInput?.closest("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(window.claudeUsage.addAccount).toHaveBeenCalledWith("Personal");

    await act(async () => {
      if (renameInput) {
        setInputValue(renameInput, "Work");
      }
    });
    await act(async () => {
      findButton(container, "Rename")?.click();
    });
    expect(window.claudeUsage.renameAccount).toHaveBeenCalledWith("local-placeholder", "Work");

    await act(async () => {
      findEnabledButton(container, "Use")?.click();
    });
    expect(window.claudeUsage.setActiveAccount).toHaveBeenCalledWith("secondary-account");

    await act(async () => {
      if (sessionInput) {
        setInputValue(sessionInput, "synthetic-session-secret");
      }
      if (orgInput) {
        setInputValue(orgInput, "org_123");
      }
    });
    await act(async () => {
      sessionInput?.closest("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(window.claudeUsage.saveClaudeCredentials).toHaveBeenCalledWith(
      "local-placeholder",
      "synthetic-session-secret",
      "org_123"
    );
    expect(container.querySelector<HTMLInputElement>('input[name="session-key"]')?.value).toBe("");
    expect(document.body.textContent).not.toContain("synthetic-session-secret");

    await act(async () => {
      if (sessionInput) {
        setInputValue(sessionInput, "synthetic-session-secret-2");
      }
    });
    await act(async () => {
      findButton(container, "Test connection")?.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(window.claudeUsage.testClaudeConnection).toHaveBeenCalledWith("synthetic-session-secret-2", "org_123");
    expect(container.querySelector<HTMLInputElement>('input[name="session-key"]')?.value).toBe("");
    expect(document.body.textContent).toContain("Claude connection succeeded.");
    expect(document.body.textContent).not.toContain("synthetic-session-secret-2");
  });

  it("submits provider placeholders and write-only GitHub settings from settings", async () => {
    const { container } = await renderRoute(<SettingsRoute />);
    const codexEnabled = container.querySelector<HTMLInputElement>('input[name="codex-provider-enabled"]');
    const geminiDismissed = container.querySelector<HTMLInputElement>('input[name="gemini-provider-dismissed"]');
    const settingsForm = container.querySelector<HTMLSelectElement>('select[name="time-display"]')?.closest("form");

    await act(async () => {
      codexEnabled?.click();
      geminiDismissed?.click();
    });
    await act(async () => {
      settingsForm?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(window.claudeUsage.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: expect.objectContaining({
          codex: expect.objectContaining({ enabled: true }),
          gemini: expect.objectContaining({ setupPromptDismissed: true })
        })
      })
    );

    const githubUsername = container.querySelector<HTMLInputElement>('input[name="github-username"]');
    const githubToken = container.querySelector<HTMLInputElement>('input[name="github-token"]');
    const githubForm = githubUsername?.closest("form");
    const githubEnabled = githubForm?.querySelector<HTMLInputElement>('input[type="checkbox"]');

    await act(async () => {
      githubEnabled?.click();
      if (githubUsername) {
        setInputValue(githubUsername, " octocat ");
      }
      if (githubToken) {
        setInputValue(githubToken, "ghp_synthetic_secret");
      }
    });
    await act(async () => {
      githubForm?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(window.claudeUsage.saveGitHubSettings).toHaveBeenCalledWith({
      enabled: true,
      token: "ghp_synthetic_secret",
      username: "octocat"
    });
    expect(container.querySelector<HTMLInputElement>('input[name="github-token"]')?.value).toBe("");
    expect(document.body.textContent).not.toContain("ghp_synthetic_secret");
  });

  it("mounts onboarding and overlay routes with placeholder state", async () => {
    await renderRoute(<OnboardingRoute />);
    expect(document.body.textContent).toContain("Connect usage tracking");
    expect(document.body.textContent).toContain("Review provider status");

    await unmountRoutes();
    document.body.innerHTML = "";
    await renderRoute(<OverlayRoute />);
    expect(document.body.textContent).toContain("42% session");
    expect(document.body.textContent).toContain("Five-hour");
  });

  it("routes overlay double-click and context actions through narrow preload commands", async () => {
    const { container } = await renderRoute(<OverlayRoute />);
    const overlayFrame = container.querySelector<HTMLElement>(".overlay-frame");

    await act(async () => {
      overlayFrame?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(window.claudeUsage.openPopover).toHaveBeenCalled();

    await act(async () => {
      overlayFrame?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });
    expect(findButton(container, "Hide")).not.toBeNull();

    await act(async () => {
      findButton(container, "Hide")?.click();
    });
    expect(window.claudeUsage.updateSettings).toHaveBeenCalledWith({ overlay: { visible: false } });
    expect(window.claudeUsage.hideOverlay).toHaveBeenCalled();
  });

  async function renderRoute(route: React.ReactNode): Promise<{ readonly container: HTMLDivElement }> {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(route);
    });
    await act(async () => {
      await Promise.resolve();
    });

    return { container };
  }

  async function unmountRoutes(): Promise<void> {
    for (const root of roots) {
      await act(async () => {
        root.unmount();
      });
    }
    roots = [];
  }
});

function importRendererApp(): Promise<typeof import("./renderer/app/index.js")> {
  return import("./renderer/app/index.js");
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement | null {
  return (
    Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === label) ?? null
  );
}

function findEnabledButton(container: HTMLElement, label: string): HTMLButtonElement | null {
  return (
    Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === label && !button.disabled
    ) ?? null
  );
}

function createMockPreloadApi() {
  return {
    addAccount: vi.fn(async () => mockAccounts),
    exportDiagnostics: vi.fn(async () => ({
      entries: [],
      generatedAt: "2026-04-15T12:00:00.000Z",
      summary: "Diagnostics export is not connected in the foundation IPC skeleton."
    })),
    generateWrapper: vi.fn(),
    getAccounts: vi.fn(async () => mockAccounts),
    getProviderDiagnostics: vi.fn(),
    getGitHubHeatmap: vi.fn(async () => mockGitHubHeatmap),
    getSettings: vi.fn(async () => mockSettings),
    getUsageHistory: vi.fn(async () => mockUsageHistory),
    getUsageState: vi.fn(async () => mockUsageState),
    refreshNow: vi.fn(async () => ({
      ...mockUsageState,
      lastUpdatedAt: "2026-04-15T12:00:00.000Z"
    })),
    refreshGitHubHeatmap: vi.fn(async () => mockGitHubHeatmap),
    removeAccount: vi.fn(async () => mockAccounts),
    renameAccount: vi.fn(async () => mockAccounts),
    runProviderDetection: vi.fn(),
    saveClaudeCredentials: vi.fn(async () => [
      {
        ...mockAccounts[0],
        authStatus: "configured",
        orgId: "org_123"
      },
      mockAccounts[1]
    ]),
    setActiveAccount: vi.fn(async () => mockAccounts),
    saveGitHubSettings: vi.fn(async () => mockGitHubHeatmap),
    hideOverlay: vi.fn(async () => undefined),
    openPopover: vi.fn(async () => undefined),
    subscribeUsageUpdated: vi.fn(() => () => undefined),
    testClaudeConnection: vi.fn(async () => ({
      ok: true,
      status: "connected",
      message: "Claude connection succeeded."
    })),
    updateSettings: vi.fn(async () => mockSettings),
    verifyWrapper: vi.fn()
  } satisfies Window["claudeUsage"];
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function setSelectValue(select: HTMLSelectElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  valueSetter?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

const mockAccounts: readonly AccountSummary[] = [
  {
    authStatus: "missing_credentials",
    id: "local-placeholder",
    isActive: true,
    label: "Local placeholder",
    orgId: null
  },
  {
    authStatus: "configured",
    id: "secondary-account",
    isActive: false,
    label: "Secondary",
    orgId: "org_456"
  }
];

const mockSettings: AppSettings = {
  launchAtLogin: false,
  migration: {
    providerImport: true,
    swiftAppImport: true
  },
  notifications: {
    authExpired: true,
    enabled: true,
    providerDegraded: false,
    sessionReset: true,
    sessionWarningPercent: 80,
    thresholdWarnings: true,
    weeklyReset: true,
    weeklyWarningPercent: 80
  },
  onboarding: {
    completed: false,
    skipped: false
  },
  overlay: {
    enabled: false,
    visible: false,
    layout: "compact",
    opacity: 0.9,
    bounds: null
  },
  paceTheme: "balanced",
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
  timeDisplay: "countdown",
  weeklyColorMode: "pace-aware"
};

const mockUsageState: UsageState = {
  activeProviderId: "claude",
  lastUpdatedAt: null,
  providers: [
    {
      actions: [],
      adapterMode: "passive",
      confidence: "observed_only",
      confidenceExplanation: "Claude usage is fetched from the active account.",
      dailyRequestCount: null,
      detailText: "Resets at 2:00 PM.",
      displayName: "Claude",
      enabled: true,
      headline: "Claude usage is below the five-hour limit",
      lastUpdatedAt: "2026-04-15T12:00:00.000Z",
      providerId: "claude",
      requestsPerMinute: null,
      resetAt: "2026-04-15T14:00:00.000Z",
      sessionUtilization: 0.42,
      status: "configured",
      weeklyUtilization: 0.19
    }
  ],
  warning: null
};

const mockUsageHistory = {
  generatedAt: "2026-04-15T12:00:00.000Z",
  points: [
    {
      accountId: "local-placeholder",
      capturedAt: "2026-04-15T11:00:00.000Z",
      providerId: "claude",
      resetAt: "2026-04-15T14:00:00.000Z",
      sessionUtilization: 0.3,
      weeklyUtilization: 0.15
    },
    {
      accountId: "local-placeholder",
      capturedAt: "2026-04-15T12:00:00.000Z",
      providerId: "claude",
      resetAt: "2026-04-15T14:00:00.000Z",
      sessionUtilization: 0.42,
      weeklyUtilization: 0.19
    }
  ]
};

const mockGitHubHeatmap = {
  configured: false,
  enabled: false,
  error: null,
  lastFetchedAt: null,
  nextRefreshAt: null,
  status: "disabled",
  totalContributions: 0,
  username: null,
  weeks: []
} as const;

const configuredGitHubHeatmap: GitHubHeatmapResult = {
  configured: true,
  enabled: true,
  error: null,
  lastFetchedAt: "2026-04-15T12:00:00.000Z",
  nextRefreshAt: "2026-04-15T13:00:00.000Z",
  status: "ready",
  totalContributions: 12,
  username: "octocat",
  weeks: [
    {
      contributionDays: [
        {
          contributionCount: 0,
          date: "2026-04-14"
        },
        {
          contributionCount: 7,
          date: "2026-04-15"
        }
      ]
    }
  ]
};
