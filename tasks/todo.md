# Phase 3: Product UI Parity

> Project: ClaudeUsage Electron cross-platform app
> Source: `specs/electron-cross-platform-ai-usage-monitor.md`
> Scope: Port the Swift app's non-provider Claude product experience into Electron where cross-platform APIs allow it: pace semantics, history visualization, GitHub heatmap, complete settings/onboarding, overlay behavior, notifications, and polished tray/menu behavior. Preserve the secure Electron boundary: renderer code only receives validated, secret-free state through the preload API.
> Test strategy: tests-after

## Priority Task Queue

- [ ] `$roadmap --existing specs/provider-telemetry-endpoints.md` - reconcile the provider telemetry add-on into `tasks/roadmap.md` because `specs/provider-telemetry-endpoints.md` was modified at 2026-04-16 14:14:00 -0400, after `tasks/roadmap.md` at 2026-04-16 12:02:39 -0400, and the current roadmap only contains Electron phases with no Provider Telemetry phase.
- [ ] `$plan-interview --ideas` - triage unspecced ideas because `tasks/ideas.md` was last modified at 2026-03-23 09:07:26 -0400 and still contains idea entries without corresponding specs under `specs/`.

## Implementation
- [x] Step 3.1: [automated] Port Swift pace semantics into shared pure functions under `electron-app/src/shared/formatting/pace.ts`: session/weekly pace windows, unknown guards, behind/way-behind/warning/critical/limit-hit status, daily budget, today usage baseline, and time display formatting.

  **What:** Add the pure, renderer-safe formatting/calculation layer that later Phase 3 UI and tray work can call. Match the Swift `UsageViewModel` pace semantics without introducing main-process storage, IPC, or UI changes in this step.

  **Files to create or modify:**
  - `electron-app/src/shared/formatting/pace.ts`: new pure TypeScript module for pace calculations and formatting helpers.
  - `electron-app/src/shared/formatting/index.ts`: optional barrel export if local convention needs one.
  - `electron-app/src/shared/types/index.ts` or `electron-app/src/shared/schemas/index.ts`: export formatting types only if needed by existing imports; avoid widening runtime schemas unless a later renderer/API step needs it.

  **Swift reference behavior to port:**
  - Weekly pace ratio uses the 7-day window from `sevenDay.resetsAt`.
  - Weekly pace is unknown in the first 6 hours and final 1 hour of the window.
  - Session pace ratio uses the 5-hour window from `fiveHour.resetsAt`.
  - Session pace is unknown in the first 15 minutes and final 5 minutes of the window.
  - Status values: `unknown`, `on_track`, `behind_pace`, `way_behind`, `warning`, `critical`, `limit_hit`.
  - Ratio thresholds: `> 1.4` is `critical`, `> 1.15` is `warning`, `< 0.6` is `way_behind`, `< 0.85` is `behind_pace`, otherwise `on_track`.
  - Session fallback before the stable window: raw utilization `>= 80` is `critical`, `>= 60` is `warning`, otherwise `unknown`.
  - Weekly under-use states only apply when weekly color mode is `pace_aware`; raw-percentage mode should not classify under-use as behind/way-behind.
  - `limit_hit` wins when the relevant utilization is `>= 100`.

  **Recommended API shape:**
  - `type PaceStatus = "unknown" | "on_track" | "behind_pace" | "way_behind" | "warning" | "critical" | "limit_hit"`.
  - `type WeeklyColorMode = "pace_aware" | "raw_percentage"`.
  - `type TimeDisplayFormat = "reset_time" | "remaining_time"`.
  - `calculatePaceRatio(limit, options)` where `options` includes `windowSeconds`, `now`, `minimumElapsedSeconds`, and `minimumRemainingSeconds`.
  - `getSessionPaceStatus(fiveHour, now)`.
  - `getWeeklyPaceStatus(sevenDay, { now, weeklyColorMode })`.
  - `getWeeklyPaceIndicator(sevenDay, now)` returning `""`, `"▲"`, or `"▼"`.
  - `calculateTodayUsagePercent(currentWeeklyUtilization, snapshots, now)` using `UsageSnapshotSummary`-like data. Prefer the last snapshot before local midnight; fall back to the earliest same-day snapshot; clamp negative deltas to 0.
  - `calculateDailyBudgetPercent(sevenDay, now)` returning rounded remaining weekly percentage divided by remaining days, or `0` when reset has passed or remaining usage is exhausted.
  - `getPaceGuidance(status)` and `formatWeeklyPaceDetail(...)` matching Swift copy: `On pace - use more`, `Behind pace - pick it up`, `Way behind - use it or lose it`, `Ahead of pace - ease up`, `Way ahead - slow down`, `Maxed out`, `Calculating...`.
  - `formatCountdown(resetAt, now)` as `h:mm:ss`, clamped at `0:00:00`.
  - `formatResetTime(resetAt, locale?)` using local timezone formatting suitable for tray/popover text.
  - `formatTimeDisplay({ format, resetAt, now, locale })` selecting reset time or countdown.

  **Implementation notes:**
  - Use `ClaudeUsageLimit` from `electron-app/src/shared/schemas/claudeUsage.ts` as the input shape where practical.
  - Keep the module side-effect free and deterministic by passing `now` into calculations; do not read system time internally except in thin default wrappers if unavoidable.
  - Treat malformed or absent reset timestamps as `unknown`/empty formatting output instead of throwing in renderer-facing helpers.
  - Keep all values as percentages on the same 0-100 scale returned by Claude, not 0-1 utilization fractions.
  - Do not add emojis or theme UI in this step unless a small static map is required by `formatWeeklyPaceDetail`; settings UI for themes belongs to Step 3.4.

  **Validation for Step 3.1:**
  - `npm run typecheck` from `electron-app/`.
  - `npm test -- --run` from `electron-app/` to catch existing regressions.
  - `npm run build` from `electron-app/` if shared exports or renderer imports change.
  - No Electron smoke is required for this pure shared module step unless runtime wiring is added unexpectedly.

- [x] Step 3.2: [automated] Expand history storage and visualization with `electron-app/src/main/storage/history.ts` and renderer components under `electron-app/src/renderer/components/`: 24-hour snapshots, 24h-to-7d hourly compaction, session/weekly sparklines, and last-updated text.
- [x] Step 3.3: [automated] Implement GitHub contribution heatmap support in `electron-app/src/main/services/github.ts`, secret GitHub token storage, settings controls, hourly refresh behavior, GraphQL variables, and renderer heatmap components.
- [x] Step 3.4: [automated] Implement the complete settings/onboarding experience in `electron-app/src/renderer/settings/` and `electron-app/src/renderer/onboarding/`: time display, pace theme, weekly color mode, launch at login, provider enablement placeholders, migration prompt placeholders, and notification preferences.
- [x] Step 3.5: [automated] Implement overlay behavior in `electron-app/src/main/windows.ts` and `electron-app/src/renderer/overlay/`: compact/minimal/sidebar layouts, always-on-top behavior, opacity, drag-to-move, position persistence, double-click popover, and context hide/disable action.
- [x] Step 3.6: [automated] Implement local notifications in `electron-app/src/main/services/notifications.ts`: session reset, auth expired, provider degraded placeholder, and user-configurable threshold warnings.
- [ ] Step 3.7: [automated] Polish tray/menu behavior in `electron-app/src/main/tray.ts`: exact Claude countdown/reset text, color/icon state, context menu actions, and launch-at-login handling.

## Green
- [ ] Step 3.8: [automated] Add regression tests for pace functions, history compaction, GitHub GraphQL request construction, overlay settings persistence, notification preferences, and renderer component state.
- [ ] Step 3.9: [automated] Add Electron/Playwright smoke coverage for settings, onboarding, popover, overlay layouts, error states, and GitHub disabled/configured states.
- [ ] Step 3.10: [automated] Run Phase 3 verification: `npm run typecheck`, `npm test`, `npm run build`, and renderer smoke tests.

## Milestone
- [ ] Electron matches the Swift product's non-provider Claude UI behavior where cross-platform APIs allow it.
- [ ] Pace, countdown, history, heatmap, overlay, notifications, and settings work without exposing secrets.
- [ ] All phase tests pass.
- [ ] No regressions.

## Next Step Plan: Step 3.7

Polish tray/menu behavior for the Electron Phase 3 product UI parity pass.

**What Step 3.7 requires:**
- Make the tray surface reflect sanitized Claude/provider state instead of the current static skeleton where cross-platform tray APIs allow it.
- Show exact Claude countdown/reset text using the shared pace/time formatting helpers and the user-selected `settings.timeDisplay` mode.
- Add color/icon state for normal, warning, critical, expired/degraded, missing configuration, and limit-hit cases without exposing secrets to renderer code.
- Wire context menu actions that are currently placeholders, especially `Refresh Now`, overlay toggle state, provider selection/pinning placeholders, onboarding/settings, and quit.
- Apply `settings.launchAtLogin` through Electron app login-item APIs when settings change.
- Preserve Linux tray fallback behavior and keep window-based controls working when tray creation is unavailable.

**Files to create or modify:**
- `electron-app/src/main/tray.ts`: extend `TrayController` with state updates, dynamic tooltip/title/icon/menu rendering, refresh action enablement, and launch-at-login helper support if it belongs with tray behavior.
- `electron-app/src/main/app.ts`: pass current usage/settings state and action callbacks into the tray controller; update launch-at-login when settings change.
- `electron-app/src/main/ipc.ts`: only adjust if refresh/action dependencies need a narrow main-process callback; keep renderer responses sanitized.
- `electron-app/src/shared/formatting/pace.ts` or `electron-app/src/shared/formatting/index.ts`: reuse existing formatting helpers; only add small pure helpers if tray text needs a missing deterministic formatter.
- `electron-app/src/main/tray.test.ts` or existing foundation main tests: cover menu actions, fallback behavior, tray state text/icon decisions, and launch-at-login calls with mocked Electron APIs.

**Approach and trade-offs:**
- Keep tray rendering deterministic by deriving a small `TrayPresentationState` from sanitized usage/settings state, then applying it to Electron `Tray`/`Menu`.
- Prefer existing formatting helpers for reset/countdown text instead of duplicating time math in the tray controller.
- Do not implement full provider adapter rotation in this step; provider selection can remain a placeholder menu structure unless existing state already supports it cleanly.
- Keep launch-at-login updates idempotent and guarded for unsupported platforms or test mocks.
- Avoid creating a renderer-facing tray API; the main process already owns tray and settings state.

**Validation for Step 3.7:**
- `npm run typecheck` from `electron-app/`.
- `npm test -- --run` from `electron-app/`.
- `npm run build` from `electron-app/`.
- Add focused tray tests before running the full suite.
