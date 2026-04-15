# Post-Review Remediation

> Project: ClaudeUsage (macOS menu bar app + Tauri cross-platform app)
> Source: 2026-04-11 expert review follow-up, re-checked against current code before being added.
> Scope: These items are not Phase 7 regressions, but they should be remediated before the next release candidate.
> Test strategy: tdd
> Prior roadmap status: Phases 1-7 of the multi-provider CLI monitor are complete.

## Priority Task Queue

- [ ] Resolve or explicitly defer orphaned manual tasks in `tasks/manual-todo.md` - clean up six unchecked Codex/Gemini validation and wrapper-adoption items because they reference already-completed Phase 2-5 work, while `tasks/roadmap.md` marks Phases 1-7 complete and archived phase files through `tasks/phases/phase-7-cross-platform-follow-through.md` exist.
- [ ] `$plan-phases specs/electron-cross-platform-ai-usage-monitor.md` - decompose the new Electron cross-platform product spec into executable roadmap phases because `specs/electron-cross-platform-ai-usage-monitor.md` was added on 2026-04-15 11:20, while `tasks/roadmap.md` was last updated on 2026-04-11 20:21 and only covers the completed multi-provider/Tauri roadmap.
- [ ] `$plan-interview --ideas` - triage or prune old unspecced ideas because `tasks/ideas.md` still contains multiple quick-win, medium, and larger initiatives from 2026-03-23 that have no corresponding current spec in `specs/`.

## Tests First
- [x] Step R.1: [automated] Add regression tests for Tauri tray menu commands.

  **What:** Cover the `Refresh Now` and `Toggle Overlay` context menu paths so they execute the same backend behavior as the frontend buttons instead of only emitting unused events.

  **Files to modify:**
  - `tauri-app/src-tauri/src/lib.rs`
  - `tauri-app/src-tauri/src/commands.rs` or a new testable helper module

  **Implementation plan for a fresh session:**
  1. Inspect tray menu setup in `tauri-app/src-tauri/src/lib.rs` and the existing frontend-backed commands in `tauri-app/src-tauri/src/commands.rs`.
  2. Identify the currently emitted tray events (`trigger-refresh`, `trigger-toggle-overlay`) and the backend behavior they should invoke.
  3. Extract or expose small testable helpers if the existing command bodies are too Tauri-window-specific to call directly in unit tests.
  4. Add failing Rust tests that prove tray refresh reaches the same refresh path and tray overlay reaches the same toggle path.
  5. Keep this step red-phase only unless the failing behavior can be tested without production changes.

  **Acceptance criteria:**
  - Tray menu "Refresh Now" triggers the existing refresh path.
  - Tray menu "Toggle Overlay" toggles overlay state through the existing overlay path.
  - No unhandled `trigger-refresh` or `trigger-toggle-overlay` events remain.

- [x] Step R.2: [automated] Add macOS provider-shell tests proving stale adapter refresh timestamps are used in the live `ProviderShellViewModel` path.

  **What:** Existing stale tests validate the coordinator overload, but the production shell currently calls the overload without refresh times. Add tests at the view-model boundary so stale Codex/Gemini cards and tray text cannot regress.

  **Files to modify:**
  - `ClaudeUsageTests/DiagnosticsTests.swift` or a new provider-shell diagnostics test file
  - `ClaudeUsage/Models/ProviderShellViewModel.swift`

  **Implementation plan for a fresh session:**
  1. Inspect `ProviderShellViewModel.rebuildShellState(...)` and confirm it currently calls `ProviderCoordinator.makeShellState(providers:now:)` without `refreshTimes`.
  2. Inspect `CodexAdapter` and `GeminiAdapter` to confirm both expose `lastRefreshTime`, then decide the smallest test seam for controlling those timestamps at the shell boundary.
  3. Add failing XCTest coverage in `ClaudeUsageTests/DiagnosticsTests.swift` or a focused new provider-shell diagnostics file proving stale Codex and/or Gemini adapter timestamps produce `.stale` cards through `ProviderShellViewModel.shellState`.
  4. Add failing tray-text coverage proving the selected stale provider text includes the stale indicator through the live `ProviderShellViewModel` path, not only `ProviderCoordinator` helpers.
  5. Keep this step red-phase only unless production changes are strictly limited to testability scaffolding needed for the failing tests to compile.

  **Acceptance criteria:**
  - A Codex or Gemini adapter with `lastRefreshTime` older than `ProviderCoordinator.staleThreshold` produces a `.stale` provider card in `ProviderShellViewModel.shellState`.
  - Stale provider tray text contains a stale indicator when that provider is selected.

- [x] Step R.3: [automated] Add Codex passive parser tests for documented sources and incremental production refresh.

  **What:** Verify `CODEX_HOME`, bookmark persistence, recursive `sessions/YYYY/MM/DD/rollout-*.jsonl` parsing, and merged history/session events before changing the adapter.

  **Files to modify:**
  - `ClaudeUsageTests/CodexAdapterTests.swift`
  - `ClaudeUsage/Services/CodexDetector.swift`
  - `ClaudeUsage/Services/CodexActivityParser.swift`
  - `ClaudeUsage/Services/CodexAdapter.swift`

  **Implementation plan for a fresh session:**
  1. Add detection coverage in `ClaudeUsageTests/CodexAdapterTests.swift` proving the default Codex home resolver honors `CODEX_HOME` when present and falls back to `~/.codex` when absent.
  2. Add parser coverage for recursive session layout under `sessions/YYYY/MM/DD/rollout-*.jsonl`; include at least one nested rollout file with prompt/completion events and one limit-hit error line.
  3. Add adapter refresh coverage proving `CodexAdapter.refresh()` stores a history bookmark and only parses appended `history.jsonl` content on a second refresh.
  4. Add adapter coverage proving passive events from `history.jsonl` and recursive session rollout files are merged before confidence/cooldown evaluation.
  5. Keep this step red-phase only. Production changes should be limited to tiny testability seams needed for tests to compile, not the actual parser/adapter remediation.

  **Acceptance criteria:**
  - Default Codex detection respects `CODEX_HOME` when present.
  - `CodexAdapter.refresh()` does not reparse all of `history.jsonl` on every 15-second refresh.
  - Recursive session rollout files are included in passive activity and limit-hit detection.

- [x] Step R.4: [automated] Add Tauri settings regression coverage for preserving configured org IDs.

  **What:** Opening Settings for a configured Tauri account should show the saved non-secret org ID, so saving unrelated preferences does not require the user to re-enter it.

  **Files to modify:**
  - `tauri-app/src-tauri/src/models.rs`
  - `tauri-app/src-tauri/src/state.rs`
  - `tauri-app/src/types.ts`
  - `tauri-app/src/settings.ts`

  **Implementation plan for a fresh session:**
  1. Inspect the Tauri settings load/save flow in `tauri-app/src/settings.ts`, the frontend state types in `tauri-app/src/types.ts`, and the Rust state/config model in `tauri-app/src-tauri/src/models.rs` and `tauri-app/src-tauri/src/state.rs`.
  2. Add failing Rust coverage proving configured account metadata exposes the active account org ID while omitting the session key from serialized frontend state.
  3. Add failing TypeScript/front-end coverage if the project has a lightweight test seam for `settings.ts`; otherwise add a small testable helper that maps loaded settings/account state to form values and assert the org ID input is populated from saved metadata.
  4. Keep this step red-phase only. Production changes should be limited to tiny testability seams needed for tests to compile, not the actual org-ID preservation fix.
  5. Run the narrow Rust/frontend validation needed to prove the new tests fail for the expected missing org-ID exposure and population behavior.

  **Acceptance criteria:**
  - `UsageState` or a settings-specific command exposes the active account org ID.
  - The Tauri Settings org ID input is populated for configured accounts.
  - Session keys remain secret and are not serialized to the frontend state.

## Implementation
- [x] Step R.5: [automated] Wire stale provider diagnostics into the live macOS shell.

  **What:** Pass Codex/Gemini adapter `lastRefreshTime` values into `ProviderCoordinator.makeShellState(providers:now:refreshTimes:)`, and update tray formatting so stale cards are visible in the running app.

  **Files to modify:**
  - `ClaudeUsage/Models/ProviderShellViewModel.swift`
  - `ClaudeUsage/Models/ProviderTypes.swift` if tray/card helpers need adjustment

  **Implementation plan for a fresh session:**
  1. Inspect the stale-shell tests added in Step R.2, especially the cases asserting stale Codex/Gemini cards through `ProviderShellViewModel.shellState` and stale selected-provider tray text.
  2. Inspect `ProviderShellViewModel.rebuildShellState(...)` and confirm it still calls `ProviderCoordinator.makeShellState(providers:now:)` without refresh times.
  3. Collect refresh timestamps from the live adapters, keyed by provider ID (`.codex` from `codexAdapter.lastRefreshTime`, `.gemini` from `geminiAdapter.lastRefreshTime`), without changing provider enablement or refresh scheduling.
  4. Pass that map into `ProviderCoordinator.makeShellState(providers:now:refreshTimes:)` so the existing stale threshold/card-state logic is used by the production shell.
  5. If the tray assertion still fails, adjust the narrow tray formatting path in `ProviderShellViewModel` or existing `ProviderTypes` helpers so selected stale providers include the stale indicator without changing non-stale provider copy.
  6. Run focused macOS stale-shell tests first, then run the full `xcodebuild test -scheme ClaudeUsage -destination 'platform=macOS'` suite to prove no shell regressions.

  **Acceptance criteria:**
  - Stale cards appear in the Providers disclosure section after refresh timestamps exceed 300 seconds.
  - Tray rotation does not silently present stale data as fresh.
  - Existing 108 macOS tests pass plus the new stale-shell tests.

- [x] Step R.6: [automated] Complete Codex passive-source and configuration remediation.

  **What:** Make the production Codex adapter match the documented passive-monitoring contract: `CODEX_HOME`, incremental history parsing, recursive session parsing, plan selection, and useful headroom text.

  **Files to modify:**
  - `ClaudeUsage/Services/CodexDetector.swift`
  - `ClaudeUsage/Services/CodexActivityParser.swift`
  - `ClaudeUsage/Services/CodexAdapter.swift`
  - `ClaudeUsage/Models/CodexTypes.swift`
  - `ClaudeUsage/Views/SettingsView.swift`
  - `ClaudeUsage/Models/ProviderSettingsStore.swift`

  **Implementation plan for a fresh session:**
  1. Start from the Step R.3 red tests in `ClaudeUsageTests/CodexAdapterTests.swift`, especially:
     - `CodexDetectionTests.testDefaultAdapterRespectsCodexHomeEnvironmentVariable`
     - `CodexActivityParsingTests.testParsesRecursiveDatedSessionRolloutFiles`
     - `CodexAdapterRefreshTests.testRefreshReusesHistoryBookmarkForAppendedContent`
     - `CodexAdapterRefreshTests.testRefreshMergesHistoryAndRecursiveSessionEventsBeforeCooldownEvaluation`
  2. Update `CodexDetector` and the default `CodexAdapter` initializer to resolve the Codex home from `CODEX_HOME` when present, falling back to `~/.codex` only when the environment variable is absent or empty. Keep the detector/parser pointed at the same resolved home.
  3. Extend `CodexActivityParser` so passive parsing includes recursive `sessions/YYYY/MM/DD/rollout-*.jsonl` files. Reuse existing line parsing where possible, skip malformed lines, and preserve the current privacy boundary: timestamps, event type, duration/model metadata only; no prompt bodies.
  4. Add an adapter-level history bookmark so repeated `CodexAdapter.refresh()` calls parse only appended `history.jsonl` content after the first read. Preserve the test seam added in Step R.3 so bookmark values remain observable.
  5. Merge passive events from incremental `history.jsonl`, recursive session rollout files, and wrapper ledger events before confidence and cooldown evaluation. Limit-hit events from rollout files must contribute to cooldown state.
  6. Inspect `CodexPlanProfile`, `ProviderSettingsStore`, and `SettingsView` for the existing Codex plan-picker path. If it is missing or disconnected, add a Settings picker that persists the selected plan and updates the live adapter without app restart.
  7. Improve Codex headroom/confidence copy only where the current model has a defensible source. Do not introduce exact remaining quota claims for passive or wrapper-only data.
  8. Run the focused R.3 validation first:
     `xcodebuild test -scheme ClaudeUsage -destination 'platform=macOS' -only-testing:ClaudeUsageTests/CodexDetectionTests -only-testing:ClaudeUsageTests/CodexActivityParsingTests -only-testing:ClaudeUsageTests/CodexAdapterRefreshTests`
  9. Then run `xcodebuild test -scheme ClaudeUsage -destination 'platform=macOS'`. Any remaining failures should be new regressions unless they are documented red-phase tests from later Tauri steps.

  **Acceptance criteria:**
  - Codex plan picker exists in macOS Settings and updates adapter estimation without restart.
  - Passive events from history and recursive session files are merged.
  - The adapter stores and reuses parse bookmarks.
  - Codex still never claims exact remaining quota without a defensible source.

- [x] Step R.7: [automated] Add Gemini auth/plan confirmation controls to macOS Settings.

  **What:** Replace the read-only Gemini plan label with actual auth-mode and plan controls that match the multi-provider setup spec.

  **Files to modify:**
  - `ClaudeUsage/Views/SettingsView.swift`
  - `ClaudeUsage/Models/ProviderSettingsStore.swift`
  - `ClaudeUsage/Services/GeminiAdapter.swift`
  - `ClaudeUsage/Models/GeminiTypes.swift`

  **Implementation plan for a fresh session:**
  1. Inspect the existing Gemini settings row in `ClaudeUsage/Views/SettingsView.swift` and the Gemini persistence helpers in `ClaudeUsage/Models/ProviderSettingsStore.swift`.
  2. Inspect `GeminiPlanProfile`, `GeminiAuthMode`, and `GeminiConfidenceEngine.evaluate(...)` to confirm which persisted user selections the adapter can consume today.
  3. Replace the read-only Gemini plan display with Settings controls for auth mode and plan. Use small preset menus and keep user-facing copy explicit that API key and Vertex limits may be user-specific.
  4. Add a `ProviderShellViewModel` update path, mirroring the Codex plan update path from Step R.6, so Gemini plan/auth changes update the live adapter without app restart.
  5. If the adapter does not currently accept an explicit user-confirmed auth mode, add a narrow property or parameter on `GeminiAdapter` and pass it into the estimate path without changing passive detection.
  6. Run focused Gemini settings/adapter validation if tests exist or add narrow model/store tests if there is no UI test seam, then run `xcodebuild test -scheme ClaudeUsage -destination 'platform=macOS'`.

  **Acceptance criteria:**
  - User can confirm Gemini auth mode and plan in Settings.
  - Gemini adapter confidence/rate pressure uses the selected settings without app restart.
  - User-facing copy continues to state that API key and Vertex limits may be user-specific.

- [ ] Step R.8: [automated] Fix Tauri tray menu command wiring.

  **What:** Replace the unused emitted events in the tray context menu with direct calls into shared refresh and overlay helpers, or register backend listeners that invoke those helpers.

  **Files to modify:**
  - `tauri-app/src-tauri/src/lib.rs`
  - `tauri-app/src-tauri/src/commands.rs` or a shared state/action helper module

  **Implementation plan for a fresh session:**
  1. Start from the red tray tests in `tauri-app/src-tauri/src/lib.rs`, especially:
     - `tray_refresh_menu_uses_backend_refresh_action`
     - `tray_toggle_overlay_menu_uses_backend_overlay_action`
     - `tray_menu_does_not_emit_unused_frontend_events`
  2. Inspect `tray_menu_action_for_id(...)` in `tauri-app/src-tauri/src/lib.rs`; it currently maps `refresh` and `toggle_overlay` to `EmitEvent("trigger-refresh")` and `EmitEvent("trigger-toggle-overlay")`, which have no backend listeners.
  3. Inspect the frontend-backed Tauri commands in `tauri-app/src-tauri/src/commands.rs`: `refresh_now(app, state)` performs the authenticated fetch and updates tray tooltip, while `toggle_overlay(app, state)` toggles `config.overlay_enabled`, persists config, and creates/closes the overlay.
  4. Extract the command bodies into small shared async helpers that accept `AppHandle` plus the shared `Arc<Mutex<AppState>>`, then have both the `#[tauri::command]` functions and tray menu handler call those helpers. Keep command signatures unchanged for the frontend.
  5. Update `TrayMenuAction` so `refresh` and `toggle_overlay` represent backend actions rather than emitted frontend events. The tray handler should spawn async work with `tauri::async_runtime::spawn` to avoid blocking the menu event callback.
  6. After refresh completes from the tray path, emit the same `usage-updated` event the frontend expects, and keep tray tooltip/state updates aligned with the existing `refresh_now` behavior.
  7. After overlay toggles from the tray path, persist config and create/close the overlay through the same helper used by the frontend command.
  8. Run `cargo test tray` first to prove the red tests go green, then run full `cargo test` in `tauri-app/src-tauri/`.

  **Acceptance criteria:**
  - Context menu refresh updates state and emits `usage-updated`.
  - Context menu overlay toggle creates/closes the overlay and persists config.
  - `cargo test` passes.

- [ ] Step R.9: [automated] Preserve Tauri org ID in Settings.

  **What:** Expose only non-secret account metadata needed by Settings and populate the org ID field from that data.

  **Files to modify:**
  - `tauri-app/src-tauri/src/models.rs`
  - `tauri-app/src-tauri/src/state.rs`
  - `tauri-app/src/types.ts`
  - `tauri-app/src/settings.ts`

  **Acceptance criteria:**
  - Opening Settings for a configured account shows the current org ID.
  - Saving credentials continues to update the selected account only.
  - Session key remains write-only from the Settings UI perspective.

- [ ] Step R.10: [automated] Escape Tauri provider-card text before inserting HTML.

  **What:** Apply the existing `escapeHtml` helper to provider-card headline, confidence explanation, and any future detail text before appending to `innerHTML`.

  **Files to modify:**
  - `tauri-app/src/main.ts`

  **Acceptance criteria:**
  - Provider cards escape dynamic strings the same way usage bars already do.
  - `npm run build` passes.

## Green
- [ ] Step R.11: [automated] Run full remediation verification.

  **Verification checklist:**
  1. `xcodebuild test -scheme ClaudeUsage -destination 'platform=macOS'` passes.
  2. `cargo test` in `tauri-app/src-tauri/` passes.
  3. `npm run build` in `tauri-app/` passes.
  4. Update `docs/cross-platform-parity.md` if any Tauri gap status changes from deferred/gap to ported.
  5. Append a remediation completion entry to `tasks/history.md`.

## Milestone
- [ ] Tray menu commands use the same backend behavior as frontend actions.
- [ ] Live macOS provider shell honors stale adapter refresh timestamps.
- [ ] Codex passive parsing matches documented source and bookmark behavior.
- [ ] Tauri settings preserve non-secret configured account metadata.
- [ ] Provider-card text insertion is escaped.
- [ ] Full remediation verification passes.
