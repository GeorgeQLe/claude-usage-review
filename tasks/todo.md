# Post-Review Remediation

> Project: ClaudeUsage (macOS menu bar app + Tauri cross-platform app)
> Source: 2026-04-11 expert review follow-up, re-checked against current code before being added.
> Scope: These items are not Phase 7 regressions, but they should be remediated before the next release candidate.
> Test strategy: tdd
> Prior roadmap status: Phases 1-7 of the multi-provider CLI monitor are complete.

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

- [ ] Step R.2: [automated] Add macOS provider-shell tests proving stale adapter refresh timestamps are used in the live `ProviderShellViewModel` path.

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

- [ ] Step R.3: [automated] Add Codex passive parser tests for documented sources and incremental production refresh.

  **What:** Verify `CODEX_HOME`, bookmark persistence, recursive `sessions/YYYY/MM/DD/rollout-*.jsonl` parsing, and merged history/session events before changing the adapter.

  **Files to modify:**
  - `ClaudeUsageTests/CodexAdapterTests.swift`
  - `ClaudeUsage/Services/CodexDetector.swift`
  - `ClaudeUsage/Services/CodexActivityParser.swift`
  - `ClaudeUsage/Services/CodexAdapter.swift`

  **Acceptance criteria:**
  - Default Codex detection respects `CODEX_HOME` when present.
  - `CodexAdapter.refresh()` does not reparse all of `history.jsonl` on every 15-second refresh.
  - Recursive session rollout files are included in passive activity and limit-hit detection.

- [ ] Step R.4: [automated] Add Tauri settings regression coverage for preserving configured org IDs.

  **What:** Opening Settings for a configured Tauri account should show the saved non-secret org ID, so saving unrelated preferences does not require the user to re-enter it.

  **Files to modify:**
  - `tauri-app/src-tauri/src/models.rs`
  - `tauri-app/src-tauri/src/state.rs`
  - `tauri-app/src/types.ts`
  - `tauri-app/src/settings.ts`

  **Acceptance criteria:**
  - `UsageState` or a settings-specific command exposes the active account org ID.
  - The Tauri Settings org ID input is populated for configured accounts.
  - Session keys remain secret and are not serialized to the frontend state.

## Implementation
- [ ] Step R.5: [automated] Wire stale provider diagnostics into the live macOS shell.

  **What:** Pass Codex/Gemini adapter `lastRefreshTime` values into `ProviderCoordinator.makeShellState(providers:now:refreshTimes:)`, and update tray formatting so stale cards are visible in the running app.

  **Files to modify:**
  - `ClaudeUsage/Models/ProviderShellViewModel.swift`
  - `ClaudeUsage/Models/ProviderTypes.swift` if tray/card helpers need adjustment

  **Acceptance criteria:**
  - Stale cards appear in the Providers disclosure section after refresh timestamps exceed 300 seconds.
  - Tray rotation does not silently present stale data as fresh.
  - Existing 108 macOS tests pass plus the new stale-shell tests.

- [ ] Step R.6: [automated] Complete Codex passive-source and configuration remediation.

  **What:** Make the production Codex adapter match the documented passive-monitoring contract: `CODEX_HOME`, incremental history parsing, recursive session parsing, plan selection, and useful headroom text.

  **Files to modify:**
  - `ClaudeUsage/Services/CodexDetector.swift`
  - `ClaudeUsage/Services/CodexActivityParser.swift`
  - `ClaudeUsage/Services/CodexAdapter.swift`
  - `ClaudeUsage/Models/CodexTypes.swift`
  - `ClaudeUsage/Views/SettingsView.swift`
  - `ClaudeUsage/Models/ProviderSettingsStore.swift`

  **Acceptance criteria:**
  - Codex plan picker exists in macOS Settings and updates adapter estimation without restart.
  - Passive events from history and recursive session files are merged.
  - The adapter stores and reuses parse bookmarks.
  - Codex still never claims exact remaining quota without a defensible source.

- [ ] Step R.7: [automated] Add Gemini auth/plan confirmation controls to macOS Settings.

  **What:** Replace the read-only Gemini plan label with actual auth-mode and plan controls that match the multi-provider setup spec.

  **Files to modify:**
  - `ClaudeUsage/Views/SettingsView.swift`
  - `ClaudeUsage/Models/ProviderSettingsStore.swift`
  - `ClaudeUsage/Services/GeminiAdapter.swift`
  - `ClaudeUsage/Models/GeminiTypes.swift`

  **Acceptance criteria:**
  - User can confirm Gemini auth mode and plan in Settings.
  - Gemini adapter confidence/rate pressure uses the selected settings without app restart.
  - User-facing copy continues to state that API key and Vertex limits may be user-specific.

- [ ] Step R.8: [automated] Fix Tauri tray menu command wiring.

  **What:** Replace the unused emitted events in the tray context menu with direct calls into shared refresh and overlay helpers, or register backend listeners that invoke those helpers.

  **Files to modify:**
  - `tauri-app/src-tauri/src/lib.rs`
  - `tauri-app/src-tauri/src/commands.rs` or a shared state/action helper module

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
