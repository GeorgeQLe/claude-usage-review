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

  it("scans and imports migration metadata without rendering source paths or secrets", async () => {
    const { container } = await renderRoute(<SettingsRoute />);

    expect(document.body.textContent).toContain("Import app metadata");
    expect(document.body.textContent).toContain("Recent import");
    expect(document.body.textContent).not.toContain("/Users/georgele/Library");

    await act(async () => {
      findButton(container, "Scan for app data")?.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(window.claudeUsage.scanMigrationSources).toHaveBeenCalled();
    expect(document.body.textContent).toContain("Swift ClaudeUsage app");
    expect(document.body.textContent).toContain("1 account");
    expect(document.body.textContent).toContain("Re-enter Claude session keys, GitHub tokens");
    expect(document.body.textContent).toContain("provider auth tokens");
    expect(document.body.textContent).toContain("API keys");
    expect(document.body.textContent).toContain("raw provider output");
    expect(document.body.textContent).not.toContain("sk-ant");
    expect(document.body.textContent).not.toContain("ghp_");
    expect(document.body.textContent).not.toContain("config.json");

    await act(async () => {
      findButton(container, "Import metadata")?.click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(window.claudeUsage.runMigrationImport).toHaveBeenCalledWith("swift-1");
    expect(document.body.textContent).toContain("Swift ClaudeUsage app imported");
    expect(document.body.textContent).not.toMatch(/sk-ant|ghp_|provider-secret|private prompt|raw stdout|raw stderr/iu);
  });

  it("renders Linux safeStorage backend warnings without exposing stored secrets", async () => {
    window.claudeUsage.getUsageState = vi.fn(async () => ({
      ...mockUsageState,
      warning:
        "Electron safeStorage is using the Linux basic_text backend. Secrets are stored with weaker local protection on this desktop session."
    }));

    await renderRoute(<SettingsRoute />);

    expect(document.body.textContent).toContain("Linux basic_text backend");
    expect(document.body.textContent).toContain("weaker local protection");
    expect(document.body.textContent).not.toMatch(/sk-ant|ghp_|provider-secret|private prompt|raw stdout|raw stderr/iu);
  });

  it("renders provider settings rows from derived status only and exposes refresh/diagnostics actions", async () => {
    const { container } = await renderRoute(<SettingsRoute />);

    expect(document.body.textContent).toContain("Codex");
    expect(document.body.textContent).toContain("Gemini");
    expect(document.body.textContent).toContain("Estimated from local Codex activity.");
    expect(document.body.textContent).toContain("High confidence from Gemini /stats.");
    expect(container.querySelector<HTMLSelectElement>('select[name="codex-provider-plan"]')).not.toBeNull();
    expect(container.querySelector<HTMLSelectElement>('select[name="gemini-provider-auth-mode"]')).not.toBeNull();
    expect(findButton(container, "Refresh Codex")).not.toBeNull();
    expect(findButton(container, "Gemini diagnostics")).not.toBeNull();
    expect(document.body.textContent).not.toContain("codex-secret-token");
    expect(document.body.textContent).not.toContain("gemini-secret-token");
  });

  it("exports redacted diagnostics from Settings without secret-bearing renderer output", async () => {
    window.claudeUsage.exportDiagnostics = vi.fn(async () => ({
      entries: [
        "App: ClaudeUsage 0.1.0; platform darwin.",
        "Storage: claude-usage.sqlite3; safeStorage available.",
        "Recent log: provider redacted diagnostics.",
        "Provider: Codex redacted redacted redacted."
      ],
      generatedAt: "2026-04-18T12:04:00.000Z",
      summary: "ClaudeUsage diagnostics export: 3 providers, 1 warnings or failures, 1 recent log events."
    }));

    const { container } = await renderRoute(<SettingsRoute />);

    expect(document.body.textContent).toContain("Diagnostics");
    expect(findButton(container, "Generate diagnostics")).not.toBeNull();

    await act(async () => {
      findButton(container, "Generate diagnostics")?.click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(window.claudeUsage.exportDiagnostics).toHaveBeenCalled();
    expect(document.body.textContent).toContain("ClaudeUsage diagnostics export");
    expect(document.body.textContent).toContain("platform darwin");
    expect(document.body.textContent).not.toMatch(/sk-ant|ghp_|provider-secret|private prompt|raw stdout|raw stderr/iu);
  });

  it("renders Accuracy Mode setup and verification controls without secret-bearing renderer state", async () => {
    window.claudeUsage.generateWrapper = vi.fn(async () => ({
      command: "export PATH='/tmp/ClaudeUsage/wrappers/codex':$PATH",
      instructions: ["Run this command manually in your shell."],
      providerId: "codex",
      verified: false
    }));
    window.claudeUsage.verifyWrapper = vi.fn(async () => ({
      message: "Codex wrapper is active.",
      providerId: "codex",
      verified: true
    }));

    const { container } = await renderRoute(<SettingsRoute />);

    expect(document.body.textContent).toContain("Accuracy Mode");
    expect(document.body.textContent).toContain("Optional");
    expect(document.body.textContent).toContain("invocation timing");
    expect(document.body.textContent).toContain("derived limit signals");
    expect(document.body.textContent).toContain("Removal");

    await act(async () => {
      findButton(container, "Generate Codex wrapper")?.click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(window.claudeUsage.generateWrapper).toHaveBeenCalledWith("codex");

    await act(async () => {
      findButton(container, "Verify Codex wrapper")?.click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(window.claudeUsage.verifyWrapper).toHaveBeenCalledWith("codex");
    expect(document.body.textContent).not.toMatch(/sk-ant|ghp_|provider-secret|private prompt|raw stdout|raw stderr/iu);
  });

  it("keeps Accuracy Mode onboarding copy optional and privacy scoped", async () => {
    await renderRoute(<OnboardingRoute />);

    expect(document.body.textContent).toContain("Accuracy Mode");
    expect(document.body.textContent).toContain("manual setup");
    expect(document.body.textContent).toContain("does not edit shell profiles");
    expect(document.body.textContent).toContain("does not store prompts or stdout");
  });

  it("renders passive provider cards without Claude-only usage meters", async () => {
    const { PopoverRoute } = await importRendererApp();
    const { container } = await renderRoute(<PopoverRoute />);
    const codexCard = findArticleByHeading(container, "Codex");
    const geminiCard = findArticleByHeading(container, "Gemini");

    expect(codexCard?.textContent).toContain("Estimated from local Codex activity.");
    expect(codexCard?.textContent).toContain("7 requests today");
    expect(codexCard?.textContent).not.toContain("Five-hour usage");
    expect(geminiCard?.textContent).toContain("High confidence from Gemini /stats.");
    expect(geminiCard?.textContent).toContain("42 requests today");
    expect(geminiCard?.textContent).toContain("2/min");
    expect(geminiCard?.textContent).not.toContain("Weekly usage");
  });

  it("renders overlay summaries for the active passive provider", async () => {
    window.claudeUsage.getUsageState = vi.fn(async () => ({
      ...mockUsageState,
      activeProviderId: "gemini"
    }));

    await renderRoute(<OverlayRoute />);

    expect(document.body.textContent).toContain("Gemini");
    expect(document.body.textContent).toContain("42 requests today");
    expect(document.body.textContent).toContain("High confidence from Gemini /stats.");
    expect(document.body.textContent).toContain("2/min");
    expect(document.body.textContent).not.toContain("42% session");
    expect(document.body.textContent).not.toContain("Five-hour");
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

function findArticleByHeading(container: HTMLElement, heading: string): HTMLElement | null {
  return (
    Array.from(container.querySelectorAll("article")).find((article) =>
      Array.from(article.querySelectorAll("h2")).some((node) => node.textContent?.trim() === heading)
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
    getMigrationRecords: vi.fn(async () => mockMigrationRecords),
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
    scanMigrationSources: vi.fn(async () => mockMigrationScan),
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
    runMigrationImport: vi.fn(async () => mockMigrationImportResult),
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
      setupPromptDismissed: false,
      accuracyModeEnabled: false,
      adapterMode: "passive",
      authMode: "unknown",
      plan: "unknown",
      profileLabel: null,
      lastRefreshAt: null,
      staleAfterMinutes: 30
    },
    gemini: {
      enabled: false,
      setupPromptDismissed: false,
      accuracyModeEnabled: false,
      adapterMode: "passive",
      authMode: "unknown",
      plan: "unknown",
      profileLabel: null,
      lastRefreshAt: null,
      staleAfterMinutes: 30
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
    },
    {
      actions: ["refresh", "diagnostics"],
      adapterMode: "passive",
      confidence: "estimated",
      confidenceExplanation: "Estimated from local Codex activity.",
      dailyRequestCount: 7,
      detailText: "Local history parsed one minute ago.",
      displayName: "Codex",
      enabled: true,
      headline: "Codex activity observed",
      lastUpdatedAt: "2026-04-15T12:00:00.000Z",
      providerId: "codex",
      requestsPerMinute: 1,
      resetAt: null,
      sessionUtilization: null,
      status: "configured",
      weeklyUtilization: null
    },
    {
      actions: ["refresh", "diagnostics"],
      adapterMode: "passive",
      confidence: "high_confidence",
      confidenceExplanation: "High confidence from Gemini /stats.",
      dailyRequestCount: 42,
      detailText: "Gemini /stats summary parsed one minute ago.",
      displayName: "Gemini",
      enabled: true,
      headline: "Gemini request window is healthy",
      lastUpdatedAt: "2026-04-15T12:00:00.000Z",
      providerId: "gemini",
      requestsPerMinute: 2,
      resetAt: null,
      sessionUtilization: null,
      status: "configured",
      weeklyUtilization: null
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

const allSkippedSecretCategories = [
  "claude-session-key",
  "github-token",
  "provider-auth-token",
  "api-key",
  "cookie",
  "raw-provider-session",
  "raw-provider-prompt",
  "raw-provider-output"
] as const;

const mockMigrationScan = {
  scannedAt: "2026-04-15T12:00:00.000Z",
  candidates: [
    {
      candidateId: "swift-1",
      displayName: "Swift ClaudeUsage app",
      error: null,
      metadataCounts: {
        accounts: 1,
        appSettings: 1,
        historySnapshots: 2,
        providerSettings: 1
      },
      skippedSecretCategories: allSkippedSecretCategories,
      sourceKind: "swift",
      status: "ready",
      warnings: []
    }
  ]
} as const;

const mockMigrationImportResult = {
  displayName: "Swift ClaudeUsage app",
  failures: [],
  importedAt: "2026-04-15T12:00:00.000Z",
  metadataCounts: {
    accounts: 1,
    appSettings: 1,
    historySnapshots: 2,
    providerSettings: 1
  },
  record: {
    displayName: "Swift ClaudeUsage app",
    failures: [],
    id: "migration-1",
    importedAt: "2026-04-15T12:00:00.000Z",
    metadataCounts: {
      accounts: 1,
      appSettings: 1,
      historySnapshots: 2,
      providerSettings: 1
    },
    skippedSecretCategories: allSkippedSecretCategories,
    sourceKind: "swift",
    status: "imported",
    warnings: []
  },
  skippedSecretCategories: allSkippedSecretCategories,
  sourceKind: "swift",
  status: "imported",
  warnings: []
} as const;

const mockMigrationRecords = {
  generatedAt: "2026-04-15T12:00:00.000Z",
  records: [mockMigrationImportResult.record]
} as const;
