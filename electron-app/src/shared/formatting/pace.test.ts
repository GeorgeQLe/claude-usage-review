import { describe, expect, it } from "vitest";
import type { ClaudeUsageLimit } from "../schemas/claudeUsage.js";
import {
  calculateDailyBudgetPercent,
  calculatePaceRatio,
  calculateTodayUsagePercent,
  formatTimeDisplay,
  formatWeeklyPaceDetail,
  getSessionPaceStatus,
  getWeeklyPaceIndicator,
  getWeeklyPaceStatus
} from "./pace.js";

describe("pace formatting regressions", () => {
  it("guards pace calculations until enough of the session window has elapsed", () => {
    expect(
      calculatePaceRatio(limit(12, "2026-04-15T16:50:00.000Z"), {
        minimumElapsedSeconds: 15 * 60,
        minimumRemainingSeconds: 5 * 60,
        now: "2026-04-15T12:00:00.000Z",
        windowSeconds: 5 * 3600
      })
    ).toBeNull();

    expect(getSessionPaceStatus(limit(70, "2026-04-15T16:50:00.000Z"), "2026-04-15T12:00:00.000Z")).toBe(
      "warning"
    );
    expect(getSessionPaceStatus(limit(92, "2026-04-15T16:50:00.000Z"), "2026-04-15T12:00:00.000Z")).toBe(
      "critical"
    );
    expect(getSessionPaceStatus(limit(100, "2026-04-15T16:00:00.000Z"), "2026-04-15T12:00:00.000Z")).toBe(
      "limit_hit"
    );
  });

  it("classifies session and weekly pace using reset windows and weekly color mode", () => {
    expect(getSessionPaceStatus(limit(8, "2026-04-15T16:00:00.000Z"), "2026-04-15T12:00:00.000Z")).toBe(
      "way_behind"
    );
    expect(getSessionPaceStatus(limit(17, "2026-04-15T16:00:00.000Z"), "2026-04-15T12:00:00.000Z")).toBe(
      "on_track"
    );
    expect(getSessionPaceStatus(limit(30, "2026-04-15T16:00:00.000Z"), "2026-04-15T12:00:00.000Z")).toBe(
      "critical"
    );

    const weeklyLimit = limit(5, "2026-04-21T12:00:00.000Z");
    expect(getWeeklyPaceStatus(weeklyLimit, { now: "2026-04-15T12:00:00.000Z", weeklyColorMode: "pace-aware" })).toBe(
      "way_behind"
    );
    expect(getWeeklyPaceStatus(weeklyLimit, { now: "2026-04-15T12:00:00.000Z", weeklyColorMode: "raw-percentage" })).toBe(
      "on_track"
    );
    expect(getWeeklyPaceIndicator(weeklyLimit, "2026-04-15T12:00:00.000Z")).toBe("▼");
  });

  it("derives today usage from the pre-midnight weekly baseline when available", () => {
    expect(
      calculateTodayUsagePercent(
        33,
        [
          { capturedAt: "2026-04-15T03:55:00.000Z", weeklyUtilization: 24 },
          { capturedAt: "2026-04-15T04:05:00.000Z", weeklyUtilization: 27 },
          { capturedAt: "not-a-date", weeklyUtilization: 99 }
        ],
        "2026-04-15T12:00:00.000Z"
      )
    ).toBe(9);

    expect(
      calculateTodayUsagePercent(
        33,
        [
          { capturedAt: "2026-04-15T00:05:00.000Z", weeklyUtilization: 27 },
          { capturedAt: "2026-04-15T08:00:00.000Z", weeklyUtilization: 31 }
        ],
        "2026-04-15T12:00:00.000Z"
      )
    ).toBe(6);
  });

  it("formats daily budget, weekly detail, countdown, and reset clock labels", () => {
    const sevenDay = limit(70, "2026-04-19T12:00:00.000Z");

    expect(calculateDailyBudgetPercent(limit(40, "2026-04-19T12:00:00.000Z"), "2026-04-15T12:00:00.000Z")).toBe(
      15
    );
    expect(
      formatWeeklyPaceDetail({
        now: "2026-04-15T12:00:00.000Z",
        sevenDay,
        snapshots: [{ capturedAt: "2026-04-14T23:55:00.000Z", weeklyUtilization: 31 }],
        targetLabel: "Target",
        weeklyColorMode: "pace-aware",
        weeklyLabel: "Claude"
      })
    ).toBe("Target 39%/8%/day | Claude 70%/w\n4d left | Way ahead - slow down");

    expect(
      formatTimeDisplay({
        format: "countdown",
        now: "2026-04-15T12:00:00.000Z",
        resetAt: "2026-04-15T14:05:09.000Z"
      })
    ).toBe("2:05:09");
    expect(
      formatTimeDisplay({
        format: "reset-time",
        locale: "en-US",
        now: "2026-04-15T12:00:00.000Z",
        resetAt: "2026-04-15T18:05:09.000Z"
      })
    ).toBe("2:05 PM");
  });
});

function limit(utilization: number, resetsAt: string | null): ClaudeUsageLimit {
  return {
    resetsAt,
    utilization
  };
}
