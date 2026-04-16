import { Notification } from "electron";
import type { ProviderCard } from "../../shared/types/provider.js";
import type { NotificationSettings } from "../../shared/types/settings.js";
import type { UsageState } from "../../shared/types/usage.js";

export type LocalNotificationKind = "session_reset" | "auth_expired" | "provider_degraded" | "threshold_warning";

export interface LocalNotificationRequest {
  readonly id: string;
  readonly kind: LocalNotificationKind;
  readonly providerId: string;
  readonly title: string;
  readonly body: string;
}

export interface NotificationEvaluationMemory {
  readonly resetAtByProvider: Map<string, string | null>;
  readonly statusByProvider: Map<string, ProviderCard["status"]>;
  readonly thresholdKeys: Set<string>;
}

export interface NotificationEvaluationInput {
  readonly usageState: UsageState;
  readonly settings: NotificationSettings;
  readonly memory: NotificationEvaluationMemory;
  readonly now?: Date | number | string;
}

export interface LocalNotificationService {
  readonly evaluateUsageState: (input: {
    readonly usageState: UsageState;
    readonly settings: NotificationSettings;
    readonly now?: Date | number | string;
  }) => readonly LocalNotificationRequest[];
}

export type LocalNotificationPresenter = (notification: LocalNotificationRequest) => void;

export function createNotificationEvaluationMemory(): NotificationEvaluationMemory {
  return {
    resetAtByProvider: new Map(),
    statusByProvider: new Map(),
    thresholdKeys: new Set()
  };
}

export function createLocalNotificationService(options: {
  readonly presenter?: LocalNotificationPresenter;
  readonly memory?: NotificationEvaluationMemory;
} = {}): LocalNotificationService {
  const presenter = options.presenter ?? createElectronNotificationPresenter();
  const memory = options.memory ?? createNotificationEvaluationMemory();

  return {
    evaluateUsageState: (input): readonly LocalNotificationRequest[] => {
      const notifications = evaluateLocalNotifications({ ...input, memory });
      for (const notification of notifications) {
        presenter(notification);
      }
      return notifications;
    }
  };
}

export function evaluateLocalNotifications(input: NotificationEvaluationInput): readonly LocalNotificationRequest[] {
  const notifications: LocalNotificationRequest[] = [];
  const nowMs = parseTimestamp(input.now ?? Date.now()) ?? Date.now();

  for (const provider of input.usageState.providers) {
    if (!provider.enabled) {
      rememberProvider(input.memory, provider);
      continue;
    }

    const settings = input.settings;
    const globalEnabled = settings.enabled;

    if (globalEnabled && settings.sessionReset) {
      const notification = evaluateSessionReset(provider, input.memory, nowMs);
      if (notification) {
        notifications.push(notification);
      }
    }

    if (globalEnabled && settings.authExpired) {
      const notification = evaluateStatusTransition(provider, input.memory, "expired", {
        kind: "auth_expired",
        title: `${provider.displayName} authentication expired`,
        body: "Reconnect the account to resume usage updates."
      });
      if (notification) {
        notifications.push(notification);
      }
    }

    if (globalEnabled && settings.providerDegraded) {
      const notification = evaluateStatusTransition(provider, input.memory, "degraded", {
        kind: "provider_degraded",
        title: `${provider.displayName} provider degraded`,
        body: provider.detailText ?? "Usage updates are temporarily degraded."
      });
      if (notification) {
        notifications.push(notification);
      }
    }

    if (globalEnabled && settings.thresholdWarnings) {
      notifications.push(
        ...evaluateThresholdWarnings(provider, input.memory, {
          sessionWarningPercent: settings.sessionWarningPercent,
          weeklyWarningPercent: settings.weeklyWarningPercent
        })
      );
    }

    rememberProvider(input.memory, provider);
  }

  return notifications;
}

export function createElectronNotificationPresenter(): LocalNotificationPresenter {
  return (notification): void => {
    if (typeof Notification.isSupported === "function" && !Notification.isSupported()) {
      return;
    }

    new Notification({
      title: notification.title,
      body: notification.body
    }).show();
  };
}

function evaluateSessionReset(
  provider: ProviderCard,
  memory: NotificationEvaluationMemory,
  nowMs: number
): LocalNotificationRequest | null {
  const previousResetAt = memory.resetAtByProvider.get(provider.providerId) ?? null;
  const currentResetAt = provider.resetAt;
  const previousResetMs = parseTimestamp(previousResetAt);

  if (!previousResetAt || !currentResetAt || currentResetAt === previousResetAt || previousResetMs === null) {
    return null;
  }

  if (previousResetMs > nowMs) {
    return null;
  }

  return {
    id: `session-reset:${provider.providerId}:${previousResetAt}`,
    kind: "session_reset",
    providerId: provider.providerId,
    title: `${provider.displayName} session reset`,
    body: "The five-hour session window has reset."
  };
}

function evaluateStatusTransition(
  provider: ProviderCard,
  memory: NotificationEvaluationMemory,
  status: ProviderCard["status"],
  message: {
    readonly kind: Extract<LocalNotificationKind, "auth_expired" | "provider_degraded">;
    readonly title: string;
    readonly body: string;
  }
): LocalNotificationRequest | null {
  const previousStatus = memory.statusByProvider.get(provider.providerId);
  if (provider.status !== status || previousStatus === status) {
    return null;
  }

  return {
    id: `${message.kind}:${provider.providerId}:${status}`,
    kind: message.kind,
    providerId: provider.providerId,
    title: message.title,
    body: message.body
  };
}

function evaluateThresholdWarnings(
  provider: ProviderCard,
  memory: NotificationEvaluationMemory,
  thresholds: {
    readonly sessionWarningPercent: number;
    readonly weeklyWarningPercent: number;
  }
): readonly LocalNotificationRequest[] {
  const notifications: LocalNotificationRequest[] = [];

  const sessionNotification = evaluateThresholdWarning(provider, memory, {
    metric: "session",
    thresholdPercent: thresholds.sessionWarningPercent,
    utilization: provider.sessionUtilization,
    windowKey: provider.resetAt ?? "unknown-reset",
    title: `${provider.displayName} session usage warning`
  });
  if (sessionNotification) {
    notifications.push(sessionNotification);
  }

  const weeklyNotification = evaluateThresholdWarning(provider, memory, {
    metric: "weekly",
    thresholdPercent: thresholds.weeklyWarningPercent,
    utilization: provider.weeklyUtilization,
    windowKey: "current-week",
    title: `${provider.displayName} weekly usage warning`
  });
  if (weeklyNotification) {
    notifications.push(weeklyNotification);
  }

  return notifications;
}

function evaluateThresholdWarning(
  provider: ProviderCard,
  memory: NotificationEvaluationMemory,
  input: {
    readonly metric: "session" | "weekly";
    readonly thresholdPercent: number;
    readonly utilization: number | null;
    readonly windowKey: string;
    readonly title: string;
  }
): LocalNotificationRequest | null {
  if (input.utilization === null) {
    return null;
  }

  const percent = input.utilization * 100;
  if (!Number.isFinite(percent) || percent < input.thresholdPercent) {
    return null;
  }

  const bucket = percent >= 100 ? "100" : String(input.thresholdPercent);
  const key = `threshold:${input.metric}:${provider.providerId}:${input.thresholdPercent}:${bucket}:${input.windowKey}`;
  if (memory.thresholdKeys.has(key)) {
    return null;
  }

  memory.thresholdKeys.add(key);
  const metricName = input.metric === "session" ? "Session" : "Weekly";
  return {
    id: key,
    kind: "threshold_warning",
    providerId: provider.providerId,
    title: input.title,
    body: `${metricName} usage reached ${formatPercent(percent)}.`
  };
}

function rememberProvider(memory: NotificationEvaluationMemory, provider: ProviderCard): void {
  memory.resetAtByProvider.set(provider.providerId, provider.resetAt);
  memory.statusByProvider.set(provider.providerId, provider.status);
}

function parseTimestamp(value: Date | number | string | null): number | null {
  if (value === null) {
    return null;
  }

  const timestamp = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function formatPercent(percent: number): string {
  return `${Math.round(percent)}%`;
}
