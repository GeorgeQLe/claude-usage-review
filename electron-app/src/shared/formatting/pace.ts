import type { ClaudeUsageLimit } from "../schemas/claudeUsage.js";

export type PaceStatus =
  | "unknown"
  | "on_track"
  | "behind_pace"
  | "way_behind"
  | "warning"
  | "critical"
  | "limit_hit";

export type WeeklyColorMode = "pace_aware" | "raw_percentage";

export type TimeDisplayFormat = "reset_time" | "remaining_time";

export interface PaceRatioOptions {
  readonly windowSeconds: number;
  readonly now: DateInput;
  readonly minimumElapsedSeconds: number;
  readonly minimumRemainingSeconds: number;
}

export interface WeeklyPaceStatusOptions {
  readonly now: DateInput;
  readonly weeklyColorMode?: WeeklyColorModeInput;
}

export interface UsageSnapshotLike {
  readonly capturedAt?: string | null;
  readonly timestamp?: string | number | Date | null;
  readonly weeklyUtilization: number | null;
}

export interface WeeklyPaceDetailOptions {
  readonly sevenDay: ClaudeUsageLimit | null | undefined;
  readonly snapshots?: readonly UsageSnapshotLike[];
  readonly now: DateInput;
  readonly weeklyColorMode?: WeeklyColorModeInput;
  readonly targetLabel?: string;
  readonly weeklyLabel?: string;
}

export interface TimeDisplayOptions {
  readonly format: TimeDisplayFormatInput;
  readonly resetAt: DateInput | null | undefined;
  readonly now: DateInput;
  readonly locale?: string | readonly string[];
}

type DateInput = string | number | Date;
type WeeklyColorModeInput = WeeklyColorMode | "pace-aware" | "raw-percentage";
type TimeDisplayFormatInput = TimeDisplayFormat | "reset-time" | "countdown";
type WeeklyPaceIndicator = "" | "▲" | "▼";

const SESSION_WINDOW_SECONDS = 5 * 3600;
const WEEKLY_WINDOW_SECONDS = 7 * 86400;
const SESSION_MINIMUM_ELAPSED_SECONDS = 15 * 60;
const SESSION_MINIMUM_REMAINING_SECONDS = 5 * 60;
const WEEKLY_MINIMUM_ELAPSED_SECONDS = 6 * 3600;
const WEEKLY_MINIMUM_REMAINING_SECONDS = 3600;

export function calculatePaceRatio(
  limit: ClaudeUsageLimit | null | undefined,
  options: PaceRatioOptions
): number | null {
  const utilization = getFiniteUtilization(limit);
  const resetTime = parseDateTime(limit?.resetsAt);
  const nowTime = parseDateTime(options.now);

  if (
    utilization === null ||
    resetTime === null ||
    nowTime === null ||
    !isPositiveFinite(options.windowSeconds) ||
    !isNonNegativeFinite(options.minimumElapsedSeconds) ||
    !isNonNegativeFinite(options.minimumRemainingSeconds)
  ) {
    return null;
  }

  const timeRemainingSeconds = (resetTime - nowTime) / 1000;
  const timeElapsedSeconds = options.windowSeconds - timeRemainingSeconds;

  if (
    timeElapsedSeconds < options.minimumElapsedSeconds ||
    timeRemainingSeconds < options.minimumRemainingSeconds
  ) {
    return null;
  }

  const expectedUtilization = (timeElapsedSeconds / options.windowSeconds) * 100;
  if (expectedUtilization <= 0) {
    return null;
  }

  return utilization / expectedUtilization;
}

export function getSessionPaceStatus(
  fiveHour: ClaudeUsageLimit | null | undefined,
  now: DateInput
): PaceStatus {
  const utilization = getFiniteUtilization(fiveHour);
  if (utilization === null) {
    return "unknown";
  }

  if (utilization >= 100) {
    return "limit_hit";
  }

  const ratio = calculatePaceRatio(fiveHour, {
    windowSeconds: SESSION_WINDOW_SECONDS,
    now,
    minimumElapsedSeconds: SESSION_MINIMUM_ELAPSED_SECONDS,
    minimumRemainingSeconds: SESSION_MINIMUM_REMAINING_SECONDS
  });

  if (ratio === null) {
    if (utilization >= 80) {
      return "critical";
    }
    if (utilization >= 60) {
      return "warning";
    }
    return "unknown";
  }

  return getStatusFromRatio(ratio, "pace_aware");
}

export function getWeeklyPaceStatus(
  sevenDay: ClaudeUsageLimit | null | undefined,
  options: WeeklyPaceStatusOptions
): PaceStatus {
  const utilization = getFiniteUtilization(sevenDay);
  if (utilization === null) {
    return "unknown";
  }

  if (utilization >= 100) {
    return "limit_hit";
  }

  const ratio = calculatePaceRatio(sevenDay, {
    windowSeconds: WEEKLY_WINDOW_SECONDS,
    now: options.now,
    minimumElapsedSeconds: WEEKLY_MINIMUM_ELAPSED_SECONDS,
    minimumRemainingSeconds: WEEKLY_MINIMUM_REMAINING_SECONDS
  });

  if (ratio === null) {
    return "unknown";
  }

  return getStatusFromRatio(ratio, normalizeWeeklyColorMode(options.weeklyColorMode));
}

export function getWeeklyPaceIndicator(
  sevenDay: ClaudeUsageLimit | null | undefined,
  now: DateInput
): WeeklyPaceIndicator {
  const ratio = calculatePaceRatio(sevenDay, {
    windowSeconds: WEEKLY_WINDOW_SECONDS,
    now,
    minimumElapsedSeconds: WEEKLY_MINIMUM_ELAPSED_SECONDS,
    minimumRemainingSeconds: WEEKLY_MINIMUM_REMAINING_SECONDS
  });

  if (ratio === null) {
    return "";
  }

  if (ratio > 1.15) {
    return "▲";
  }
  if (ratio < 0.85) {
    return "▼";
  }
  return "";
}

export function calculateTodayUsagePercent(
  currentWeeklyUtilization: number | null | undefined,
  snapshots: readonly UsageSnapshotLike[],
  now: DateInput
): number | null {
  if (!isFiniteNumber(currentWeeklyUtilization) || snapshots.length === 0) {
    return null;
  }

  const nowDate = parseDate(now);
  if (!nowDate) {
    return null;
  }

  const startOfDay = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime();
  let lastPreMidnight: SnapshotPoint | null = null;
  let earliestToday: SnapshotPoint | null = null;

  for (const snapshot of snapshots) {
    const weeklyUtilization = snapshot.weeklyUtilization;
    const timestamp = parseSnapshotTime(snapshot);
    if (!isFiniteNumber(weeklyUtilization) || timestamp === null) {
      continue;
    }

    const point = { timestamp, weeklyUtilization };
    if (timestamp < startOfDay) {
      if (lastPreMidnight === null || timestamp > lastPreMidnight.timestamp) {
        lastPreMidnight = point;
      }
    } else if (earliestToday === null || timestamp < earliestToday.timestamp) {
      earliestToday = point;
    }
  }

  const baseline = lastPreMidnight?.weeklyUtilization ?? earliestToday?.weeklyUtilization;
  if (baseline === undefined) {
    return null;
  }

  return Math.max(0, Math.round(currentWeeklyUtilization - baseline));
}

export function calculateDailyBudgetPercent(
  sevenDay: ClaudeUsageLimit | null | undefined,
  now: DateInput
): number | null {
  const utilization = getFiniteUtilization(sevenDay);
  const resetTime = parseDateTime(sevenDay?.resetsAt);
  const nowTime = parseDateTime(now);

  if (utilization === null || resetTime === null || nowTime === null) {
    return null;
  }

  const timeRemainingSeconds = (resetTime - nowTime) / 1000;
  if (timeRemainingSeconds <= 0) {
    return 0;
  }

  const remainingUtilization = 100 - utilization;
  if (remainingUtilization <= 0) {
    return 0;
  }

  const daysRemaining = timeRemainingSeconds / 86400;
  return Math.round(remainingUtilization / daysRemaining);
}

export function getPaceGuidance(status: PaceStatus): string {
  switch (status) {
    case "on_track":
      return "On pace - use more";
    case "behind_pace":
      return "Behind pace - pick it up";
    case "way_behind":
      return "Way behind - use it or lose it";
    case "warning":
      return "Ahead of pace - ease up";
    case "critical":
      return "Way ahead - slow down";
    case "limit_hit":
      return "Maxed out";
    case "unknown":
      return "Calculating...";
  }
}

export function formatWeeklyPaceDetail(options: WeeklyPaceDetailOptions): string | null {
  const utilization = getFiniteUtilization(options.sevenDay);
  const resetTime = parseDateTime(options.sevenDay?.resetsAt);
  const nowTime = parseDateTime(options.now);

  if (utilization === null || resetTime === null || nowTime === null) {
    return null;
  }

  if (utilization >= 100 || resetTime <= nowTime) {
    return "Weekly limit reached";
  }

  const timeRemainingSeconds = (resetTime - nowTime) / 1000;
  const daysRemaining = timeRemainingSeconds / 86400;
  const dailyBudget = calculateDailyBudgetPercent(options.sevenDay, options.now) ?? 0;
  const todayUsage = calculateTodayUsagePercent(utilization, options.snapshots ?? [], options.now) ?? 0;
  const status = getWeeklyPaceStatus(options.sevenDay, {
    now: options.now,
    weeklyColorMode: options.weeklyColorMode
  });
  const targetPrefix = options.targetLabel ? `${options.targetLabel} ` : "";
  const weeklyPrefix = options.weeklyLabel ? `${options.weeklyLabel} ` : "";

  return `${targetPrefix}${todayUsage}%/${dailyBudget}%/day | ${weeklyPrefix}${Math.round(
    utilization
  )}%/w\n${Math.floor(daysRemaining)}d left | ${getPaceGuidance(status)}`;
}

export function formatCountdown(resetAt: DateInput | null | undefined, now: DateInput): string {
  const resetTime = parseDateTime(resetAt);
  const nowTime = parseDateTime(now);

  if (resetTime === null || nowTime === null) {
    return "";
  }

  const remainingSeconds = Math.max(0, Math.floor((resetTime - nowTime) / 1000));
  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;

  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatResetTime(
  resetAt: DateInput | null | undefined,
  locale?: string | readonly string[]
): string {
  const resetDate = parseDate(resetAt);
  if (!resetDate) {
    return "";
  }

  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit"
  }).format(resetDate);
}

export function formatTimeDisplay(options: TimeDisplayOptions): string {
  switch (normalizeTimeDisplayFormat(options.format)) {
    case "reset_time":
      return formatResetTime(options.resetAt, options.locale);
    case "remaining_time":
      return formatCountdown(options.resetAt, options.now);
  }
}

function getStatusFromRatio(ratio: number, weeklyColorMode: WeeklyColorMode): PaceStatus {
  if (ratio > 1.4) {
    return "critical";
  }
  if (ratio > 1.15) {
    return "warning";
  }
  if (weeklyColorMode === "pace_aware") {
    if (ratio < 0.6) {
      return "way_behind";
    }
    if (ratio < 0.85) {
      return "behind_pace";
    }
  }
  return "on_track";
}

function normalizeWeeklyColorMode(mode: WeeklyColorModeInput | undefined): WeeklyColorMode {
  if (mode === "raw_percentage" || mode === "raw-percentage") {
    return "raw_percentage";
  }
  return "pace_aware";
}

function normalizeTimeDisplayFormat(format: TimeDisplayFormatInput): TimeDisplayFormat {
  if (format === "reset_time" || format === "reset-time") {
    return "reset_time";
  }
  return "remaining_time";
}

function getFiniteUtilization(limit: ClaudeUsageLimit | null | undefined): number | null {
  const utilization = limit?.utilization;
  return isFiniteNumber(utilization) ? utilization : null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseSnapshotTime(snapshot: UsageSnapshotLike): number | null {
  return parseDateTime(snapshot.capturedAt ?? snapshot.timestamp);
}

function parseDateTime(input: DateInput | null | undefined): number | null {
  const date = parseDate(input);
  return date ? date.getTime() : null;
}

function parseDate(input: DateInput | null | undefined): Date | null {
  if (input === null || input === undefined) {
    return null;
  }

  const date = input instanceof Date ? input : new Date(input);
  const time = date.getTime();
  return Number.isFinite(time) ? date : null;
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isNonNegativeFinite(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

interface SnapshotPoint {
  readonly timestamp: number;
  readonly weeklyUtilization: number;
}
