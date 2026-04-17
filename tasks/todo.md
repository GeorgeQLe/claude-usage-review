# Phase 3: Product UI Parity

> Project: ClaudeUsage Electron cross-platform app
> Source: `tasks/roadmap.md`
> Scope: Finish the remaining Electron Product UI Parity work. Steps 3.1 through 3.7 are already completed in `tasks/history.md`; the next executable step is the green regression suite.
> Test strategy: tests-after

## Implementation
- [x] Step 3.1: [automated] Port Swift pace semantics into shared pure functions under `electron-app/src/shared/formatting/pace.ts`: session/weekly pace windows, unknown guards, behind/way-behind/warning/critical/limit-hit status, daily budget, today usage baseline, and time display formatting.
- [x] Step 3.2: [automated] Expand history storage and visualization with `electron-app/src/main/storage/history.ts` and renderer components under `electron-app/src/renderer/components/`: 24-hour snapshots, 24h-to-7d hourly compaction, session/weekly sparklines, and last-updated text.
- [x] Step 3.3: [automated] Implement GitHub contribution heatmap support in `electron-app/src/main/services/github.ts`, secret GitHub token storage, settings controls, hourly refresh behavior, GraphQL variables, and renderer heatmap components.
- [x] Step 3.4: [automated] Implement the complete settings/onboarding experience in `electron-app/src/renderer/settings/` and `electron-app/src/renderer/onboarding/`: time display, pace theme, weekly color mode, launch at login, provider enablement placeholders, migration prompt placeholders, and notification preferences.
- [x] Step 3.5: [automated] Implement overlay behavior in `electron-app/src/main/windows.ts` and `electron-app/src/renderer/overlay/`: compact/minimal/sidebar layouts, always-on-top behavior, opacity, drag-to-move, position persistence, double-click popover, and context hide/disable action.
- [x] Step 3.6: [automated] Implement local notifications in `electron-app/src/main/services/notifications.ts`: session reset, auth expired, provider degraded placeholder, and user-configurable threshold warnings.
- [x] Step 3.7: [automated] Polish tray/menu behavior in `electron-app/src/main/tray.ts`: exact Claude countdown/reset text, color/icon state, context menu actions, and launch-at-login handling.

  **Implementation plan for Step 3.7:**
  - Add tests first around the pure tray helpers in `electron-app/src/main/tray.ts`, likely in the existing main-process tray test file. Cover exact Claude countdown/reset-time title and tooltip text, warning/critical/limit-hit/expired/degraded/missing icon states, overlay checkbox state, refresh enabled/disabled state, and menu action routing for show usage, refresh, settings, overlay, onboarding, and quit.
  - Tighten `deriveTrayPresentationState` so the title and tooltip use the active provider deterministically, preserve the configured time-display setting, and avoid truncating away the most important Claude utilization/reset signal. Keep renderer state secret-free and avoid adding provider-specific network or storage reads in the tray layer.
  - Polish `createContextMenu` behavior in `TrayController`: keep refresh disabled while already refreshing, wire all actionable menu items through existing injected callbacks, and leave provider selection/rotation controls disabled or clearly placeholder until Phase 4 provider rotation owns real selection semantics.
  - Ensure launch-at-login behavior stays centralized in `syncLaunchAtLogin` and is exercised through unit tests with a fake `Electron.App` object. Do not mutate OS login settings in tests.
  - Run focused tray tests first, then `npm run typecheck`, `npm test -- --run`, and `npm run build` from `electron-app/`. The existing accepted warning is Node's experimental SQLite warning during storage/integration tests.

## Green
- [ ] Step 3.8: [automated] Add regression tests for pace functions, history compaction, GitHub GraphQL request construction, overlay settings persistence, notification preferences, and renderer component state.

  **Implementation plan for Step 3.8:**
  - Audit existing focused coverage before adding tests: `electron-app/src/shared/formatting/pace.ts` tests, `electron-app/src/main/storage/history.test.ts`, `electron-app/src/main/services/github` coverage if present, overlay/settings behavior in `electron-app/src/foundation-main.test.ts` and `electron-app/src/foundation-renderer.test.tsx`, and notification tests in `electron-app/src/main/services/notifications.test.ts`.
  - Add only the missing regression tests needed for Phase 3 green coverage. Expected likely targets are pace edge cases around reset windows and weekly color modes, history 24h-to-7d compaction boundaries, GitHub GraphQL variable/body construction and auth-disabled behavior, overlay settings persistence through the IPC/window-manager boundary, notification preference suppression, and renderer component state for disabled/configured provider surfaces.
  - Prefer pure-function or injected-service tests over Electron runtime tests where possible. Keep secrets out of fixtures, keep network calls mocked, and avoid mutating OS-level settings.
  - Run the focused new/changed test files first, then `npm run typecheck`, `npm test -- --run`, and `npm run build` from `electron-app/`. The accepted warning remains Node's experimental SQLite warning during storage/integration tests.
- [ ] Step 3.9: [automated] Add Electron/Playwright smoke coverage for settings, onboarding, popover, overlay layouts, error states, and GitHub disabled/configured states.
- [ ] Step 3.10: [automated] Run Phase 3 verification: `npm run typecheck`, `npm test`, `npm run build`, and renderer smoke tests.

## Milestone
- [ ] Electron matches the Swift product's non-provider Claude UI behavior where cross-platform APIs allow it.
- [ ] Pace, countdown, history, heatmap, overlay, notifications, and settings work without exposing secrets.
- [ ] All phase tests pass.
- [ ] No regressions.
