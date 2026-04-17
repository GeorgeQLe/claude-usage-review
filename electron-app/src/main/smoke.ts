import type { BrowserWindow } from "electron";
import { setTimeout as delay } from "node:timers/promises";
import type { AppWindowKind, AppWindowManager } from "./windows.js";
import type { AppSettingsPatch } from "../shared/types/settings.js";

export const smokeRouteMarkers = [
  "popover-disabled-github",
  "popover-configured-github",
  "popover-ready-github",
  "settings",
  "onboarding",
  "overlay-compact",
  "overlay-minimal",
  "overlay-sidebar",
  "settings-error-retry"
] as const;

type SmokeRouteMarker = (typeof smokeRouteMarkers)[number];

interface ElectronSmokeSuiteOptions {
  readonly windowManager: AppWindowManager;
  readonly updateSettings: (patch: AppSettingsPatch) => void;
  readonly timeoutMs?: number;
}

export interface SmokeDomSnapshot {
  readonly text: string;
  readonly html: string;
  readonly inputValues: readonly string[];
  readonly mainClassName: string | null;
}

interface SmokeDomExpectation {
  readonly marker: SmokeRouteMarker;
  readonly expectedText: readonly string[];
  readonly expectedMainClass?: string;
  readonly forbiddenText?: readonly string[];
}

const smokeTimeoutMs = 7_500;
const smokeGitHubToken = "ghp_smoke_secret_should_not_render";
const smokeClaudeSessionKey = "sk-ant-smoke-secret-should-not-render";

const smokeExpectations = {
  popoverDisabledGitHub: {
    marker: "popover-disabled-github",
    expectedText: [
      "Usage overview",
      "Claude usage is below the five-hour limit",
      "Five-hour usage",
      "42%",
      "GitHub Contributions",
      "Enable GitHub in Settings"
    ],
    forbiddenText: [smokeGitHubToken, smokeClaudeSessionKey]
  },
  popoverConfiguredGitHub: {
    marker: "popover-configured-github",
    expectedText: ["GitHub Contributions", "Configured", "Ready to refresh"],
    forbiddenText: [smokeGitHubToken, smokeClaudeSessionKey]
  },
  popoverReadyGitHub: {
    marker: "popover-ready-github",
    expectedText: ["GitHub Contributions", "Ready", "Updated", "12 contributions"],
    forbiddenText: [smokeGitHubToken, smokeClaudeSessionKey]
  },
  settings: {
    marker: "settings",
    expectedText: [
      "Account and display",
      "Preferences",
      "Claude credentials",
      "GitHub heatmap",
      "Providers",
      "Notifications",
      "Save GitHub"
    ],
    forbiddenText: [smokeGitHubToken, smokeClaudeSessionKey]
  },
  onboarding: {
    marker: "onboarding",
    expectedText: ["Connect usage tracking", "Choose a local account", "Review provider status", "Complete setup", "Skip for now"],
    forbiddenText: [smokeGitHubToken, smokeClaudeSessionKey]
  },
  overlayCompact: {
    marker: "overlay-compact",
    expectedText: ["42% session", "Five-hour", "Weekly"],
    expectedMainClass: "overlay-frame-compact",
    forbiddenText: [smokeGitHubToken, smokeClaudeSessionKey]
  },
  overlayMinimal: {
    marker: "overlay-minimal",
    expectedText: ["Claude", "42%"],
    expectedMainClass: "overlay-frame-minimal",
    forbiddenText: [smokeGitHubToken, smokeClaudeSessionKey]
  },
  overlaySidebar: {
    marker: "overlay-sidebar",
    expectedText: ["Usage", "Five-hour usage", "Weekly usage", "Auth"],
    expectedMainClass: "overlay-frame-sidebar",
    forbiddenText: [smokeGitHubToken, smokeClaudeSessionKey]
  },
  settingsError: {
    marker: "settings-error-retry",
    expectedText: ["Usage state unavailable", "Synthetic smoke renderer error.", "Try again"],
    forbiddenText: [smokeGitHubToken, smokeClaudeSessionKey]
  }
} as const satisfies Record<string, SmokeDomExpectation>;

export async function runElectronSmokeSuite({
  windowManager,
  updateSettings,
  timeoutMs = smokeTimeoutMs
}: ElectronSmokeSuiteOptions): Promise<void> {
  const popover = await showFreshWindow(windowManager, "popover");
  await assertWindowEventuallyMatches(popover, smokeExpectations.popoverDisabledGitHub, timeoutMs);
  reportSmokeRouteOk(smokeExpectations.popoverDisabledGitHub.marker);

  await configureGitHub(popover);
  const configuredPopover = await showFreshWindow(windowManager, "popover");
  await assertWindowEventuallyMatches(configuredPopover, smokeExpectations.popoverConfiguredGitHub, timeoutMs);
  reportSmokeRouteOk(smokeExpectations.popoverConfiguredGitHub.marker);

  await refreshGitHub(configuredPopover);
  const readyPopover = await showFreshWindow(windowManager, "popover");
  await assertWindowEventuallyMatches(readyPopover, smokeExpectations.popoverReadyGitHub, timeoutMs);
  reportSmokeRouteOk(smokeExpectations.popoverReadyGitHub.marker);

  const settings = await showFreshWindow(windowManager, "settings");
  await assertWindowEventuallyMatches(settings, smokeExpectations.settings, timeoutMs);
  reportSmokeRouteOk(smokeExpectations.settings.marker);

  const onboarding = await showFreshWindow(windowManager, "onboarding");
  await assertWindowEventuallyMatches(onboarding, smokeExpectations.onboarding, timeoutMs);
  reportSmokeRouteOk(smokeExpectations.onboarding.marker);

  await assertOverlayLayout(windowManager, updateSettings, "compact", smokeExpectations.overlayCompact, timeoutMs);
  await assertOverlayLayout(windowManager, updateSettings, "minimal", smokeExpectations.overlayMinimal, timeoutMs);
  await assertOverlayLayout(windowManager, updateSettings, "sidebar", smokeExpectations.overlaySidebar, timeoutMs);

  const failingSettings = await showFreshWindow(windowManager, "settings");
  await failingSettings.webContents.executeJavaScript(`window.location.hash = "smoke-error"`);
  await assertWindowEventuallyMatches(failingSettings, smokeExpectations.settingsError, timeoutMs);
  await clickButton(failingSettings, "Try again");
  await assertWindowEventuallyMatches(failingSettings, smokeExpectations.settings, timeoutMs);
  reportSmokeRouteOk(smokeExpectations.settingsError.marker);
}

export function assertSmokeDomSnapshot(snapshot: SmokeDomSnapshot, expectation: SmokeDomExpectation): void {
  const searchableText = [snapshot.text, snapshot.html, ...snapshot.inputValues].join("\n");

  for (const expectedText of expectation.expectedText) {
    if (!searchableText.includes(expectedText)) {
      throw new Error(`Smoke route ${expectation.marker} did not render expected text: ${expectedText}`);
    }
  }

  for (const forbiddenText of expectation.forbiddenText ?? []) {
    if (searchableText.includes(forbiddenText)) {
      throw new Error(`Smoke route ${expectation.marker} rendered forbidden secret text.`);
    }
  }

  if (expectation.expectedMainClass && !snapshot.mainClassName?.split(/\s+/u).includes(expectation.expectedMainClass)) {
    throw new Error(`Smoke route ${expectation.marker} did not render ${expectation.expectedMainClass}.`);
  }
}

async function assertOverlayLayout(
  windowManager: AppWindowManager,
  updateSettings: (patch: AppSettingsPatch) => void,
  layout: "compact" | "minimal" | "sidebar",
  expectation: SmokeDomExpectation,
  timeoutMs: number
): Promise<void> {
  closeExistingWindow(windowManager, "overlay");
  updateSettings({
    overlay: {
      enabled: true,
      visible: false,
      layout,
      opacity: 0.9,
      bounds: null
    }
  });

  const overlay = await windowManager.toggleOverlay();
  await assertWindowEventuallyMatches(overlay, expectation, timeoutMs);
  reportSmokeRouteOk(expectation.marker);
}

async function showFreshWindow(windowManager: AppWindowManager, kind: AppWindowKind): Promise<BrowserWindow> {
  closeExistingWindow(windowManager, kind);

  switch (kind) {
    case "popover":
      return windowManager.showPopover();
    case "settings":
      return windowManager.openSettings();
    case "onboarding":
      return windowManager.openOnboarding();
    case "overlay":
      return windowManager.toggleOverlay();
  }
}

function closeExistingWindow(windowManager: AppWindowManager, kind: AppWindowKind): void {
  const existing = windowManager.getWindow(kind);

  if (existing && !existing.isDestroyed()) {
    existing.destroy();
  }
}

async function configureGitHub(window: BrowserWindow): Promise<void> {
  await window.webContents.executeJavaScript(
    `window.claudeUsage.saveGitHubSettings(${JSON.stringify({
      enabled: true,
      username: "octocat",
      token: smokeGitHubToken
    })})`
  );
}

async function refreshGitHub(window: BrowserWindow): Promise<void> {
  await window.webContents.executeJavaScript("window.claudeUsage.refreshGitHubHeatmap()");
}

async function clickButton(window: BrowserWindow, label: string): Promise<void> {
  await window.webContents.executeJavaScript(`
    (() => {
      const button = Array.from(document.querySelectorAll("button")).find((candidate) => candidate.textContent?.trim() === ${JSON.stringify(label)});
      if (!button) {
        throw new Error("Smoke button not found: ${label}");
      }
      button.click();
    })()
  `);
}

async function assertWindowEventuallyMatches(
  window: BrowserWindow,
  expectation: SmokeDomExpectation,
  timeoutMs: number
): Promise<void> {
  const startedAt = Date.now();
  let lastError: Error | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await readDomSnapshot(window);

    try {
      assertSmokeDomSnapshot(snapshot, expectation);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await delay(100);
    }
  }

  const finalSnapshot = await readDomSnapshot(window);
  const snapshotSummary = [
    `text=${JSON.stringify(finalSnapshot.text.slice(0, 500))}`,
    `html=${JSON.stringify(finalSnapshot.html.slice(0, 500))}`,
    `mainClass=${JSON.stringify(finalSnapshot.mainClassName)}`
  ].join(" ");
  const message = lastError?.message ?? `Smoke route ${expectation.marker} did not render before timeout.`;
  throw new Error(`${message} Last DOM snapshot: ${snapshotSummary}`);
}

async function readDomSnapshot(window: BrowserWindow): Promise<SmokeDomSnapshot> {
  return (await window.webContents.executeJavaScript(`
    (() => ({
      text: document.body.innerText || "",
      html: document.body.innerHTML || "",
      inputValues: Array.from(document.querySelectorAll("input")).map((input) => input.value || ""),
      mainClassName: document.querySelector("main")?.className || null
    }))()
  `)) as SmokeDomSnapshot;
}

function reportSmokeRouteOk(marker: SmokeRouteMarker): void {
  console.log(`CLAUDE_USAGE_ELECTRON_SMOKE_ROUTE_OK:${marker}`);
}
