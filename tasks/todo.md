# Phase 3: Product UI Parity

> Project: ClaudeUsage Electron cross-platform app
> Source: `specs/electron-cross-platform-ai-usage-monitor.md`
> Scope: Port the Swift app's non-provider Claude product experience into Electron where cross-platform APIs allow it: pace semantics, history visualization, GitHub heatmap, complete settings/onboarding, overlay behavior, notifications, and polished tray/menu behavior. Preserve the secure Electron boundary: renderer code only receives validated, secret-free state through the preload API.
> Test strategy: tests-after

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
- [ ] Step 3.5: [automated] Implement overlay behavior in `electron-app/src/main/windows.ts` and `electron-app/src/renderer/overlay/`: compact/minimal/sidebar layouts, always-on-top behavior, opacity, drag-to-move, position persistence, double-click popover, and context hide/disable action.
- [ ] Step 3.6: [automated] Implement local notifications in `electron-app/src/main/services/notifications.ts`: session reset, auth expired, provider degraded placeholder, and user-configurable threshold warnings.
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

## Next Step Plan: Step 3.5

Implement Electron overlay behavior and persistence for the Phase 3 overlay product surface.

**What Step 3.5 requires:**
- Wire overlay window behavior in the main process: always-on-top, frameless/transparent behavior where supported, user-controlled visibility, opacity, layout mode, and persisted bounds/position.
- Expand the renderer overlay route from a status-only card into compact, minimal, and sidebar layouts driven by sanitized usage/settings state.
- Add drag-to-move behavior without exposing Node/Electron APIs directly to renderer code beyond narrow preload commands if needed.
- Add double-click behavior that opens the popover and a context action that hides or disables the overlay.
- Keep provider adapters and notification delivery out of scope; Step 3.5 should only use existing usage/settings data.

**Files to create or modify:**
- `electron-app/src/shared/types/settings.ts` and `electron-app/src/shared/schemas/settings.ts`: extend overlay settings with position/bounds or visibility fields if needed for persistence.
- `electron-app/src/shared/types/ipc.ts`, `electron-app/src/shared/schemas/ipc.ts`, and `electron-app/src/preload/api.ts`: add narrow overlay commands only if renderer needs explicit hide/disable/move actions.
- `electron-app/src/main/windows.ts`: apply overlay-specific window options and persist/restore overlay bounds through settings or a small main-process helper.
- `electron-app/src/main/ipc.ts`: validate and merge any new overlay persistence fields through the existing settings path.
- `electron-app/src/renderer/overlay/index.tsx`: render compact, minimal, and sidebar layouts and wire double-click/context actions.
- `electron-app/src/renderer/components/index.tsx` and `electron-app/src/renderer/styles/app.css`: factor reusable overlay display primitives and stable responsive overlay sizing.

**Approach and trade-offs:**
- Prefer extending the existing settings contract for overlay layout/opacity/position instead of adding separate storage unless `BrowserWindow` bounds persistence needs main-process-only state.
- Keep renderer overlay commands narrow and validated; do not expose generic window movement APIs.
- Use CSS layouts for compact/minimal/sidebar first, and only add main-process window behavior where Electron APIs are required.

**Validation for Step 3.5:**
- `npm run typecheck` from `electron-app/`.
- `npm test -- --run` from `electron-app/`.
- `npm run build` from `electron-app/`.
- Add or update focused tests for overlay settings persistence and renderer layout state if implementation changes observable contracts.
