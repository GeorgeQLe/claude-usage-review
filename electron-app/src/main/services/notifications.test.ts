import { describe, expect, it, vi } from "vitest";
import { createDefaultAppSettings } from "../../shared/settings/defaults.js";
import type { ProviderCard } from "../../shared/types/provider.js";
import type { NotificationSettings } from "../../shared/types/settings.js";
import type { UsageState } from "../../shared/types/usage.js";
import {
  createLocalNotificationService,
  createNotificationEvaluationMemory,
  evaluateLocalNotifications
} from "./notifications.js";

vi.mock("electron", () => ({
  Notification: class MockNotification {
    static isSupported = vi.fn(() => true);
    readonly show = vi.fn();
  }
}));

describe("local notification evaluation", () => {
  it("emits threshold warnings once per provider metric and window", () => {
    const memory = createNotificationEvaluationMemory();
    const settings = notificationSettings();

    const first = evaluateLocalNotifications({
      memory,
      settings,
      now: "2026-04-15T12:00:00.000Z",
      usageState: usageState([
        provider({
          sessionUtilization: 0.81,
          weeklyUtilization: 0.79,
          resetAt: "2026-04-15T17:00:00.000Z"
        })
      ])
    });

    expect(first).toMatchObject([
      {
        kind: "threshold_warning",
        title: "Claude session usage warning",
        body: "Session usage reached 81%."
      }
    ]);

    const repeated = evaluateLocalNotifications({
      memory,
      settings,
      now: "2026-04-15T12:01:00.000Z",
      usageState: usageState([
        provider({
          sessionUtilization: 0.82,
          weeklyUtilization: 0.79,
          resetAt: "2026-04-15T17:00:00.000Z"
        })
      ])
    });
    expect(repeated).toEqual([]);

    const weekly = evaluateLocalNotifications({
      memory,
      settings,
      now: "2026-04-15T12:02:00.000Z",
      usageState: usageState([
        provider({
          sessionUtilization: 0.82,
          weeklyUtilization: 0.83,
          resetAt: "2026-04-15T17:00:00.000Z"
        })
      ])
    });
    expect(weekly).toMatchObject([
      {
        kind: "threshold_warning",
        title: "Claude weekly usage warning",
        body: "Weekly usage reached 83%."
      }
    ]);
  });

  it("dedupes session reset notifications by the completed reset timestamp", () => {
    const memory = createNotificationEvaluationMemory();
    const settings = notificationSettings();

    const initial = evaluateLocalNotifications({
      memory,
      settings,
      now: "2026-04-15T12:00:00.000Z",
      usageState: usageState([provider({ resetAt: "2026-04-15T12:10:00.000Z" })])
    });
    expect(initial).toEqual([]);

    const reset = evaluateLocalNotifications({
      memory,
      settings,
      now: "2026-04-15T12:11:00.000Z",
      usageState: usageState([provider({ resetAt: "2026-04-15T17:10:00.000Z" })])
    });
    expect(reset).toMatchObject([
      {
        id: "session-reset:claude:2026-04-15T12:10:00.000Z",
        kind: "session_reset",
        title: "Claude session reset"
      }
    ]);

    const repeated = evaluateLocalNotifications({
      memory,
      settings,
      now: "2026-04-15T12:12:00.000Z",
      usageState: usageState([provider({ resetAt: "2026-04-15T17:10:00.000Z" })])
    });
    expect(repeated).toEqual([]);
  });

  it("emits auth-expired and provider-degraded notifications only on status transitions", () => {
    const memory = createNotificationEvaluationMemory();
    const settings = notificationSettings({ providerDegraded: true });

    expect(
      evaluateLocalNotifications({
        memory,
        settings,
        usageState: usageState([provider({ status: "configured" }), provider({ providerId: "codex", displayName: "Codex", status: "configured" })])
      })
    ).toEqual([]);

    const transitioned = evaluateLocalNotifications({
      memory,
      settings,
      usageState: usageState([
        provider({ status: "expired" }),
        provider({
          providerId: "codex",
          displayName: "Codex",
          status: "degraded",
          detailText: "Codex usage is temporarily unavailable."
        })
      ])
    });

    expect(transitioned).toMatchObject([
      {
        kind: "auth_expired",
        title: "Claude authentication expired"
      },
      {
        kind: "provider_degraded",
        title: "Codex provider degraded",
        body: "Codex usage is temporarily unavailable."
      }
    ]);

    expect(
      evaluateLocalNotifications({
        memory,
        settings,
        usageState: usageState([
          provider({ status: "expired" }),
          provider({ providerId: "codex", displayName: "Codex", status: "degraded" })
        ])
      })
    ).toEqual([]);
  });

  it("honors global and per-notification preferences", () => {
    const memory = createNotificationEvaluationMemory();

    const disabled = evaluateLocalNotifications({
      memory,
      settings: notificationSettings({ enabled: false }),
      usageState: usageState([provider({ sessionUtilization: 0.9, weeklyUtilization: 0.9, status: "expired" })])
    });
    expect(disabled).toEqual([]);

    const thresholdDisabled = evaluateLocalNotifications({
      memory,
      settings: notificationSettings({ thresholdWarnings: false }),
      usageState: usageState([provider({ sessionUtilization: 0.9, weeklyUtilization: 0.9 })])
    });
    expect(thresholdDisabled).toEqual([]);

    const degradedDisabled = evaluateLocalNotifications({
      memory,
      settings: notificationSettings({ providerDegraded: false }),
      usageState: usageState([provider({ providerId: "codex", displayName: "Codex", status: "degraded" })])
    });
    expect(degradedDisabled).toEqual([]);
  });

  it("passes evaluated notifications through the configured presenter", () => {
    const presenter = vi.fn();
    const service = createLocalNotificationService({ presenter });

    const notifications = service.evaluateUsageState({
      settings: notificationSettings(),
      usageState: usageState([provider({ sessionUtilization: 0.88 })])
    });

    expect(notifications).toHaveLength(1);
    expect(presenter).toHaveBeenCalledWith(expect.objectContaining({ kind: "threshold_warning" }));
  });
});

function notificationSettings(patch: Partial<NotificationSettings> = {}): NotificationSettings {
  return {
    ...createDefaultAppSettings().notifications,
    ...patch
  };
}

function usageState(providers: readonly ProviderCard[]): UsageState {
  return {
    activeProviderId: providers[0]?.providerId ?? null,
    providers,
    lastUpdatedAt: "2026-04-15T12:00:00.000Z",
    warning: null
  };
}

function provider(overrides: Partial<ProviderCard> = {}): ProviderCard {
  return {
    providerId: "claude",
    displayName: "Claude",
    enabled: true,
    status: "configured",
    confidence: "exact",
    headline: "Claude usage",
    detailText: null,
    sessionUtilization: null,
    weeklyUtilization: null,
    dailyRequestCount: null,
    requestsPerMinute: null,
    resetAt: null,
    lastUpdatedAt: "2026-04-15T12:00:00.000Z",
    adapterMode: "accuracy",
    confidenceExplanation: "Test provider.",
    actions: [],
    ...overrides
  };
}
