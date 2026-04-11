# Multi-Provider CLI Monitor — Phase Plan

Build the macOS app into a multi-provider CLI usage monitor for Claude Code, Codex, and Gemini while preserving the existing Claude ingestion path exactly as it works today. The critical path is: establish a provider-aware app shell without regressing Claude, ship Codex passive monitoring, add the Codex wrapper for higher-confidence telemetry, then repeat the pattern for Gemini before hardening and cross-platform follow-through.

| Phase | Focus | Outcome |
| --- | --- | --- |
| ~~1~~ | ~~Shared provider foundation~~ | ~~Provider-aware state, rotating tray, stacked popover, Claude preserved~~ ✅ |
| ~~2~~ | ~~Codex passive adapter~~ | ~~Codex detection, passive estimation, confidence labeling~~ ✅ |
| ~~3~~ | ~~Codex wrapper~~ | ~~Optional Accuracy Mode and event ledger for Codex~~ ✅ |
| ~~4~~ | ~~Gemini passive adapter~~ | ~~Gemini detection, passive quota/rate tracking~~ ✅ |
| ~~5~~ | ~~Gemini wrapper~~ | ~~Optional Accuracy Mode and event ledger for Gemini~~ ✅ |
| 6 | Hardening and onboarding | Diagnostics, docs, regression coverage, product polish |
| 7 | Cross-platform follow-through | Tauri parity planning and deferred Windows validation |

## Phase 1: Shared Provider Foundation

### Tests First
- Step 1.1: [automated] Add failing Swift tests for provider aggregation, rotating tray selection, provider pinning, and Claude non-regression in [ClaudeUsageTests/ClaudeUsageTests.swift](/home/georgeqle/projects/tools/dev/claude-review-usage/ClaudeUsageTests/ClaudeUsageTests.swift) or split them into new provider-focused test files under [ClaudeUsageTests](/home/georgeqle/projects/tools/dev/claude-review-usage/ClaudeUsageTests).

### Implementation
- Step 1.2: [automated] Introduce provider-aware domain types for shared provider state, confidence labels, plan/auth configuration, and tray rotation policy in new or adjacent files under [ClaudeUsage/Models](/home/georgeqle/projects/tools/dev/claude-review-usage/ClaudeUsage/Models).
- Step 1.3: [automated] Add a provider coordinator/store that maps the existing Claude `UsageViewModel` output into the new provider shell without altering Claude fetching behavior, likely in [ClaudeUsage/Models/UsageViewModel.swift](/home/georgeqle/projects/tools/dev/claude-review-usage/ClaudeUsage/Models/UsageViewModel.swift) plus one or more new service/model files.
- Step 1.4: [automated] Update the menu bar and popover shell for rotating provider headlines, manual override, pinning, and stacked provider cards in [ClaudeUsage/ClaudeUsageApp.swift](/home/georgeqle/projects/tools/dev/claude-review-usage/ClaudeUsage/ClaudeUsageApp.swift), [ClaudeUsage/AppDelegate.swift](/home/georgeqle/projects/tools/dev/claude-review-usage/ClaudeUsage/AppDelegate.swift), and [ClaudeUsage/Views/ContentView.swift](/home/georgeqle/projects/tools/dev/claude-review-usage/ClaudeUsage/Views/ContentView.swift).
- Step 1.5: [automated] Extend settings/onboarding for provider enablement, plan/auth confirmation, and local install detection entry points in [ClaudeUsage/Views/SettingsView.swift](/home/georgeqle/projects/tools/dev/claude-review-usage/ClaudeUsage/Views/SettingsView.swift), [ClaudeUsage/Services/AccountStore.swift](/home/georgeqle/projects/tools/dev/claude-review-usage/ClaudeUsage/Services/AccountStore.swift), and any new configuration persistence files.

### Green
- Step 1.6: [automated] Make the new provider-shell tests pass, verify the existing Claude tests still pass, and run macOS build/test checks for the updated shell.

### Milestone
- Provider-aware state exists and can represent Claude, Codex, and Gemini side by side.
- Claude still renders through the current ingestion path with no fetch/auth behavior changes.
- The tray rotates across enabled providers, supports manual override, and supports pinning.
- The popover can show stacked provider cards for configured, missing, and degraded providers.
- All Phase 1 tests pass.
- No regressions in previous phase tests.

## Phase 2: Codex Passive Adapter

### Tests First
- Step 2.1: [automated] Add failing fixture-based tests for Codex install detection, auth presence, passive activity parsing, cooldown detection, and confidence labeling in `ClaudeUsageTests/CodexAdapterTests.swift`. ~15 tests across CodexDetectionTests, CodexActivityParsingTests, CodexCooldownTests, CodexConfidenceTests.

### Implementation
- Step 2.2: [automated] Implement Codex install/auth detection in `ClaudeUsage/Services/CodexDetector.swift`. FileManager-based checks for `~/.codex/`, `config.toml`, `auth.json`. Respects `CODEX_HOME` env var.
- Step 2.3: [automated] Implement incremental JSONL parser in `ClaudeUsage/Services/CodexActivityParser.swift`. Reads `history.jsonl` and `sessions/YYYY/MM/DD/rollout-*.jsonl` with byte-offset bookmarks. Handles corrupt lines gracefully.
- Step 2.4: [automated] Add plan profiles, confidence engine, and headroom estimation in `ClaudeUsage/Models/CodexTypes.swift`. Plans: Plus/Pro/Business with published 5-hour ranges. Confidence: exact/highConfidence/estimated/observedOnly. Headroom as band, never single number.
- Step 2.5: [automated] Wire `CodexAdapter` into `ProviderShellViewModel`. Create `ClaudeUsage/Services/CodexAdapter.swift` orchestrating detect→parse→evaluate. Add `.codexRich` snapshot case to `ProviderTypes.swift`. Update `ProviderCardView` for confidence badge/headroom. Update `SettingsView` Codex row with plan picker. Add Codex plan persistence to `ProviderSettingsStore`.

### Green
- Step 2.6: [automated] Make all Codex passive tests pass, run existing 21 tests, verify no regressions. Codex never claims exact remaining quota without a defensible source.

### Milestone
- Codex can be detected and configured as a monitored provider.
- Codex passive monitoring shows observed local activity, estimate/headroom guidance, and explicit confidence.
- Unknown or degraded Codex states remain visible and explained.
- Claude behavior remains unchanged while Codex is enabled.
- All Phase 2 tests pass.
- No regressions in previous phase tests.

## Phase 3: Codex Accuracy Mode Wrapper
> Test strategy: tdd

### Tests First
- Step 3.1: [automated] Add failing tests for Codex wrapper event models, event-ledger persistence, confidence upgrades from wrapper data, and privacy constraints in `ClaudeUsageTests/CodexWrapperTests.swift`. ~15 tests across CodexWrapperEventTests, CodexEventLedgerTests, CodexWrapperConfidenceTests, CodexPrivacyTests.

### Implementation
- Step 3.2: [automated] Add wrapper event types and event ledger model to `ClaudeUsage/Models/CodexTypes.swift`. Types: `CodexInvocationEvent` (start/end timestamps, command mode, model, limitHitDetected), `CodexEventLedger` class with JSONL append/read/rolling-window-trim and `~/Library/Application Support/ClaudeUsage/codex-events.jsonl` persistence.
- Step 3.3: [automated] Implement Codex wrapper launcher in `ClaudeUsage/Services/CodexWrapper.swift`. Launches `codex` CLI via `Process`, captures start/end timestamps, parses stderr for usage-limit errors, appends `CodexInvocationEvent` to ledger. Opt-in via `ProviderSettingsStore.codexAccuracyMode`.
- Step 3.4: [automated] Merge wrapper-derived events into `CodexAdapter.refresh()` — feed ledger events alongside passive parser events into `CodexConfidenceEngine`. Update engine so wrapper events can upgrade confidence (e.g., wrapper invocations + limit-hit patterns → `.highConfidence`). Surface Accuracy Mode toggle and status in `ClaudeUsage/Views/SettingsView.swift`.

### Green
- Step 3.5: [automated] Make all Codex wrapper tests pass, rerun all Phase 1-2 tests (46 total), and verify that Accuracy Mode improves confidence without affecting Claude.

### Milestone
- Codex Accuracy Mode can be enabled independently.
- Wrapper-derived Codex events improve confidence and update latency.
- Derived telemetry only is stored; raw prompt bodies are not persisted.
- Claude remains unaffected when Codex wrapper mode is on.
- All Phase 3 tests pass.
- No regressions in previous phase tests.

## Phase 4: Gemini Passive Adapter
> Test strategy: tdd

### Tests First
- Step 4.1: [automated] Add failing fixture-based tests for Gemini install detection, auth-mode detection, passive request counting, rate-pressure derivation, and confidence labeling in `ClaudeUsageTests/GeminiAdapterTests.swift`. ~17 tests across GeminiDetectionTests (4), GeminiActivityParsingTests (5), GeminiRatePressureTests (4), GeminiConfidenceTests (4).

### Implementation
- Step 4.2: [automated] Implement Gemini install/auth detection in `ClaudeUsage/Services/GeminiDetector.swift`. FileManager-based checks for `~/.gemini/settings.json` (install), `oauth_creds.json` (auth), and `settings.json` `security.auth.selectedType` field (auth mode: oauthPersonal, apiKey, vertexAI, codeAssist).
- Step 4.3: [automated] Implement Gemini session parser in `ClaudeUsage/Services/GeminiActivityParser.swift`. Walks `~/.gemini/tmp/**/chats/session-*.json`, extracts gemini-type messages with timestamps/tokens/model. Computes `GeminiRatePressure` (daily count, RPM over 5-min window, daily headroom against plan).
- Step 4.4: [automated] Add Gemini plan profiles, confidence engine, and adapter orchestrator in `ClaudeUsage/Models/GeminiTypes.swift` and `ClaudeUsage/Services/GeminiAdapter.swift`. Plans: Personal (1000/day, 60/min). Confidence: exact (reserved for wrapper), highConfidence (known auth + plan + stable activity), estimated (auth known, counting incomplete), observedOnly (auth detected, no quota evidence). Add `.geminiRich` snapshot case to `ProviderTypes.swift`. Add Gemini plan persistence to `ProviderSettingsStore`.
- Step 4.5: [automated] Wire `GeminiAdapter` into `ProviderShellViewModel` with 15s polling. Replace Gemini placeholder in `SettingsView` with detection status, enable toggle, auth mode display, plan picker, and rate pressure summary. Add tray text formatting for `.geminiRich` case.

### Green
- Step 4.6: [automated] Make all Gemini passive tests pass, rerun all Phase 1-3 tests (61 total), and verify that provider rotation works correctly with Claude + Codex + Gemini.

### Milestone
- Gemini can be detected and configured as a monitored provider.
- Gemini passive monitoring shows auth-mode-aware quota/rate guidance with explicit confidence.
- Provider rotation and stacked cards work with Claude, Codex, and Gemini together.
- All Phase 4 tests pass.
- No regressions in previous phase tests.

## Phase 5: Gemini Accuracy Mode Wrapper
> Test strategy: tdd

### Tests First
- Step 5.1: [automated] Add failing tests for Gemini wrapper event capture, event-ledger persistence, confidence upgrades from wrapper data, and privacy constraints in `ClaudeUsageTests/GeminiWrapperTests.swift`. ~15 tests across GeminiWrapperEventTests (3), GeminiEventLedgerTests (5), GeminiWrapperConfidenceTests (4), GeminiPrivacyTests (3).

### Implementation
- Step 5.2: [automated] Add wrapper event types and event ledger model to `ClaudeUsage/Models/GeminiTypes.swift`. Types: `GeminiInvocationEvent` (start/end timestamps, command mode, model, limitHitDetected), `GeminiEventLedger` class with JSONL append/read/rolling-window-trim and `~/Library/Application Support/ClaudeUsage/gemini-events.jsonl` persistence.
- Step 5.3: [automated] Implement Gemini wrapper launcher in `ClaudeUsage/Services/GeminiWrapper.swift`. Launches `gemini` CLI via `Process`, captures start/end timestamps, parses stderr for usage-limit errors, appends `GeminiInvocationEvent` to ledger. Opt-in via `ProviderSettingsStore.geminiAccuracyMode`.
- Step 5.4: [automated] Merge wrapper-derived events into `GeminiAdapter.refresh()` — feed ledger events alongside passive parser events into `GeminiConfidenceEngine`. Update engine so wrapper events can upgrade confidence (e.g., wrapper invocations + limit-hit patterns → `.highConfidence`). Surface Accuracy Mode toggle and status in `ClaudeUsage/Views/SettingsView.swift`.

### Green
- Step 5.5: [automated] Make all Gemini wrapper tests pass, rerun all Phase 1-4 tests (78 total), and verify that Accuracy Mode improves confidence without affecting Claude or Codex.

### Milestone
- Gemini Accuracy Mode can be enabled independently.
- Structured wrapper telemetry improves Gemini request counting and freshness.
- Passive-only Gemini usage remains fully supported.
- All Phase 5 tests pass.
- No regressions in previous phase tests.

## Phase 6: Onboarding, Diagnostics, and Product Hardening
> Test strategy: tdd

### Tests First
- Step 6.1: [automated] Add failing tests for degraded/stale provider handling, unsupported provider-version handling, onboarding copy/state transitions, and tray behavior edge cases.

  **What:** Write red-phase tests that define the degraded-state, stale-data, and diagnostic contracts before production code exists. Tests use temp directories and inline fixtures.

  **Files to create:**
  - `ClaudeUsageTests/DiagnosticsTests.swift` — new test file with these test classes:

  **AdapterDiagnosticsTests** (~5 tests):
  - `testAdapterTrackesLastRefreshTimestamp` — after refresh, `lastRefreshTime` is non-nil and recent
  - `testAdapterTracksConsecutiveFailureCount` — simulate parse errors, verify `consecutiveFailures` increments
  - `testAdapterResetFailureCountOnSuccess` — after a successful refresh following failures, `consecutiveFailures` resets to 0
  - `testAdapterReportsDegradedAfterThreeFailures` — 3+ consecutive refresh failures → adapter state becomes `.degraded(reason:)`
  - `testAdapterRecoveryFromDegradedOnSuccessfulRefresh` — degraded adapter returns to `.installed` after a successful refresh

  **StaleDetectionTests** (~4 tests):
  - `testProviderCardShowsStaleBadgeWhenRefreshOlderThan5Minutes` — card built from snapshot with `lastRefreshTime` >5 min ago → `cardState == .stale`
  - `testProviderCardShowsConfiguredWhenRefreshRecent` — card with fresh `lastRefreshTime` → `cardState == .configured`
  - `testTrayTextIncludesStaleIndicatorForStaleProvider` — tray text for a stale provider includes "·" stale marker
  - `testStaleThresholdDefaultIs300Seconds` — verify the default stale threshold constant is 300s

  **ConfidenceExplanationTests** (~3 tests):
  - `testConfidenceExplanationForObservedOnly` — `.observedOnly` confidence → explanation mentions "no plan configured"
  - `testConfidenceExplanationForEstimated` — `.estimated` confidence → explanation mentions "wrapper events" or "plan profile"
  - `testConfidenceExplanationForHighConfidence` — `.highConfidence` confidence → explanation mentions "limit detection"

  **TrayEdgeCaseTests** (~3 tests):
  - `testTrayTextForDegradedProvider` — degraded snapshot → tray text shows "Provider · Degraded"
  - `testTrayTextWhenAllProvidersDisabled` — no enabled providers → tray text shows fallback
  - `testTrayRotationSkipsDegradedProvider` — rotation prefers non-degraded provider over degraded one

  **Files to modify:**
  - `ClaudeUsage.xcodeproj/project.pbxproj` — add `DiagnosticsTests.swift` to test target

  **Acceptance criteria:**
  - `xcodebuild build` compiles (app target succeeds)
  - Test target compiles but tests fail (red phase — references not-yet-existing properties like `lastRefreshTime`, `consecutiveFailures`, `.degraded`, `.stale`, confidence explanation APIs)
  - All 93 existing tests still pass

### Implementation
- Step 6.2: [automated] Add adapter diagnostics — stale tracking, degraded states, and failure counting.

  **What:** Add `lastRefreshTime`, `consecutiveFailures`, and `.degraded` state to Codex and Gemini adapters. Add `.stale` card state to `ProviderTypes`. Wire degraded/stale into `ProviderCoordinator` card building and tray text.

  **Files to modify:**
  - `ClaudeUsage/Services/CodexAdapter.swift` — add `lastRefreshTime: Date?` and `consecutiveFailures: Int` properties; add `.degraded(reason: String)` case to `CodexAdapterState`; update `refresh()` to track success/failure counts and emit degraded after 3 failures; update `toProviderSnapshot()` for degraded state
  - `ClaudeUsage/Services/GeminiAdapter.swift` — same pattern as Codex
  - `ClaudeUsage/Models/ProviderTypes.swift` — add `.stale` case to `CardState`; add `lastRefreshTime: Date?` to `ProviderSnapshot` cases (or add as associated value); add stale threshold constant (300s); update `ProviderCoordinator.makeShellState()` to check freshness and set `.stale` card state; update tray text for degraded providers; add tray rotation preference for non-degraded
  - `ClaudeUsage/Models/ProviderShellViewModel.swift` — update `formatTrayText()` for degraded/stale cases; add fallback tray text when no providers enabled

  **Acceptance criteria:**
  - `xcodebuild build` compiles
  - `AdapterDiagnosticsTests` pass (5 tests)
  - `StaleDetectionTests` pass (4 tests)
  - `TrayEdgeCaseTests` pass (3 tests)
  - All 93 existing tests still pass

- Step 6.3: [automated] Add confidence explanations and refine onboarding/settings copy.

  **What:** Add human-readable confidence explanations to Codex and Gemini estimate types. Surface them in provider cards and settings. Add detection troubleshooting hints when provider is "Not Detected".

  **Files to modify:**
  - `ClaudeUsage/Models/CodexTypes.swift` — add `static func explanation(for confidence: CodexConfidence) -> String` to `CodexConfidenceEngine` (or as computed property on `CodexEstimate`)
  - `ClaudeUsage/Models/GeminiTypes.swift` — same pattern for Gemini
  - `ClaudeUsage/Models/ProviderTypes.swift` — add `confidenceExplanation: String?` to `ProviderCard`; update `ProviderCoordinator` to populate from estimates
  - `ClaudeUsage/Views/SettingsView.swift` — add detection help text below "Not Detected" status (e.g., "Install Codex CLI and run it once to enable monitoring"); add brief Accuracy Mode description; add privacy note for wrapper mode ("Only timestamps and metadata are stored — no prompt content")
  - `ClaudeUsage/Views/ContentView.swift` — show `confidenceExplanation` as secondary text on provider cards (if non-nil)

  **Acceptance criteria:**
  - `xcodebuild build` compiles
  - `ConfidenceExplanationTests` pass (3 tests)
  - All existing tests still pass
  - Settings shows detection help text when provider not detected

- Step 6.4: [automated] Update user-facing documentation to match multi-provider product.

  **What:** Update README.md with multi-provider feature descriptions, provider setup instructions, and confidence level documentation. Update CLAUDE.md if any conventions changed.

  **Files to modify:**
  - `README.md` — update feature list, add provider setup section (Claude/Codex/Gemini), document confidence levels, document Accuracy Mode, update screenshots description if applicable
  - `CLAUDE.md` — update test count, add Phase 6 conventions if any

  **Acceptance criteria:**
  - README documents all three providers
  - README explains confidence levels
  - No code changes in this step

### Green
- Step 6.5: [automated] Final green-phase verification gate for Phase 6.

  **What:** All tests should pass. Run the full suite, confirm no regressions, and mark Phase 6 milestone complete.

  **Verification checklist:**
  1. `xcodebuild build` — clean compile
  2. `xcodebuild test` — all tests pass (93 existing + ~15 new), 0 failures
  3. Claude files untouched
  4. Codex wrapper/confidence logic untouched (only diagnostics added)
  5. Gemini wrapper/confidence logic untouched (only diagnostics added)

  **Files to modify:**
  - `tasks/todo.md` — check off milestone items
  - `tasks/roadmap.md` — mark Phase 6 milestone complete

### Milestone
- Users can understand why each provider is exact, estimated, passive-only, or degraded.
- The app handles stale and degraded states gracefully.
- Product copy and documentation match the multi-provider product.
- All Phase 6 tests pass.
- No regressions in previous phase tests.

## Phase 7: Cross-Platform Follow-Through

### Tests First
- Step 7.1: [automated] Add failing Tauri-side model/state tests for the validated provider abstraction in [tauri-app/src-tauri/src](/home/georgeqle/projects/tools/dev/claude-review-usage/tauri-app/src-tauri/src) and corresponding frontend type tests under [tauri-app/src](/home/georgeqle/projects/tools/dev/claude-review-usage/tauri-app/src) when parity work starts.

### Implementation
- Step 7.2: [automated] Port the validated shared provider model and confidence concepts into the Tauri architecture in [tauri-app/src-tauri/src/models.rs](/home/georgeqle/projects/tools/dev/claude-review-usage/tauri-app/src-tauri/src/models.rs), [tauri-app/src-tauri/src/state.rs](/home/georgeqle/projects/tools/dev/claude-review-usage/tauri-app/src-tauri/src/state.rs), [tauri-app/src/types.ts](/home/georgeqle/projects/tools/dev/claude-review-usage/tauri-app/src/types.ts), and the Tauri UI entry files.
- Step 7.3: [automated] Resolve the deferred Windows end-to-end validation against the new product model and document any parity gaps.

### Green
- Step 7.4: [automated] Make Tauri parity tests pass, rerun relevant previous tests, and confirm the cross-platform plan is based on the validated macOS multi-provider model rather than the older Claude-only shape.

### Milestone
- Cross-platform follow-through is based on the validated multi-provider model.
- Deferred Windows validation is resolved against the new architecture.
- Any remaining parity gaps are explicit and documented.
- All Phase 7 tests pass.
- No regressions in previous phase tests.

## Cross-Phase Concerns

- Preserve the current Claude ingestion path throughout all phases; adapter and UI refactors must wrap it, not replace it.
- Keep local parsing incremental and lightweight so menu bar performance remains stable.
- Never store raw prompt bodies or auth tokens in derived telemetry stores.
- Use fixture-based tests for local CLI artifacts before relying on live local state.
- Re-run Claude regression coverage in every phase that touches shared provider state or UI.
- Validate tray rotation, pinning, and degraded-state rendering whenever a new provider is introduced.
