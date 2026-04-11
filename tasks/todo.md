# Phase 6: Onboarding, Diagnostics, and Product Hardening

> Project: ClauseUsage (macOS menu bar app) · Phase 6 of 7
> Test strategy: tdd
> Prior phases: Phase 1 (shared provider foundation) ✅, Phase 2 (Codex passive adapter) ✅, Phase 3 (Codex accuracy mode wrapper) ✅, Phase 4 (Gemini passive adapter) ✅, Phase 5 (Gemini accuracy mode wrapper) ✅
> Current test count: 93 passing

## Tests First
- [ ] Step 6.1: [automated] Add failing tests for degraded/stale provider handling, unsupported provider-version handling, onboarding copy/state transitions, and tray behavior edge cases.

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

## Implementation
- [ ] Step 6.2: [automated] Add adapter diagnostics — stale tracking, degraded states, and failure counting.

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

- [ ] Step 6.3: [automated] Add confidence explanations and refine onboarding/settings copy.

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

- [ ] Step 6.4: [automated] Update user-facing documentation to match multi-provider product.

  **What:** Update README.md with multi-provider feature descriptions, provider setup instructions, and confidence level documentation. Update CLAUDE.md if any conventions changed.

  **Files to modify:**
  - `README.md` — update feature list, add provider setup section (Claude/Codex/Gemini), document confidence levels, document Accuracy Mode, update screenshots description if applicable
  - `CLAUDE.md` — update test count, add Phase 6 conventions if any

  **Acceptance criteria:**
  - README documents all three providers
  - README explains confidence levels
  - No code changes in this step

## Green
- [ ] Step 6.5: [automated] Final green-phase verification gate for Phase 6.

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

## Milestone
- [ ] Users can understand why each provider is exact, estimated, passive-only, or degraded.
- [ ] The app handles stale and degraded states gracefully.
- [ ] Product copy and documentation match the multi-provider product.
- [ ] All Phase 6 tests pass.
- [ ] No regressions in previous phase tests.
