# Phase 6: Onboarding, Diagnostics, and Product Hardening

> Project: ClauseUsage (macOS menu bar app) · Phase 6 of 7
> Test strategy: tdd
> Prior phases: Phase 1 (shared provider foundation) ✅, Phase 2 (Codex passive adapter) ✅, Phase 3 (Codex accuracy mode wrapper) ✅, Phase 4 (Gemini passive adapter) ✅, Phase 5 (Gemini accuracy mode wrapper) ✅
> Current test count: 93 passing

## Tests First
- [x] Step 6.1: [automated] Add failing tests for degraded/stale provider handling, unsupported provider-version handling, onboarding copy/state transitions, and tray behavior edge cases.

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
- [x] Step 6.2: [automated] Add adapter diagnostics — stale tracking, degraded states, and failure counting.

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

- [x] Step 6.3: [automated] Add confidence explanations and refine onboarding/settings copy.

  **What:** Add human-readable confidence explanations to Codex and Gemini estimate types. Surface them in provider cards and settings. Add detection troubleshooting hints when provider is "Not Detected".

  **Context from Step 6.2:** A stub `explanation(for:)` was added to `CodexConfidenceEngine` (returns `""`) so `ConfidenceExplanationTests` compile. This step replaces the stub with real implementations.

  ## Changes

  ### 1. `ClaudeUsage/Models/CodexTypes.swift` (~line 60)
  Replace the stub `explanation(for:)` in `CodexConfidenceEngine` with real explanations. The 3 ConfidenceExplanationTests assert:
  - `.observedOnly` → text must contain "plan" (lowercased)
  - `.estimated` → text must contain "wrapper" or "plan" (lowercased)
  - `.highConfidence` → text must contain "limit" (lowercased)

  Example implementation:
  ```swift
  func explanation(for confidence: CodexConfidence) -> String {
      switch confidence {
      case .exact: return "Exact usage from API"
      case .highConfidence: return "High confidence from limit detection and plan profile"
      case .estimated: return "Estimated from wrapper events and plan profile"
      case .observedOnly: return "Observed activity only — configure a plan for better accuracy"
      }
  }
  ```

  ### 2. `ClaudeUsage/Models/GeminiTypes.swift`
  Add matching `explanation(for confidence: GeminiConfidence) -> String` to `GeminiConfidenceEngine` (no tests yet, but needed for symmetry and `ProviderCard` population).

  ### 3. `ClaudeUsage/Models/ProviderTypes.swift`
  - Add `confidenceExplanation: String?` field to `ProviderCard` struct
  - Update `ProviderCoordinator.makeShellState()` — for `.codexRich` and `.geminiRich` cases, populate `confidenceExplanation` using `CodexConfidenceEngine().explanation(for:)` / `GeminiConfidenceEngine().explanation(for:)`
  - All other cases set `confidenceExplanation: nil`
  - **Important:** Also update the `makeShellState(providers:now:refreshTimes:)` overload's card mapping to preserve the `confidenceExplanation` field

  ### 4. `ClaudeUsage/Views/SettingsView.swift`
  - Below the "Not Detected" text for Codex (~line 233), add helper text: "Install Codex CLI and run it once to enable monitoring"
  - Below the "Not Detected" text for Gemini (~line 264), add helper text: "Install Gemini CLI and run it once to enable monitoring"
  - Optionally add brief Accuracy Mode description and privacy note for wrapper mode

  ### 5. `ClaudeUsage/Views/ContentView.swift`
  - In the provider card rendering section (~line 191), show `confidenceExplanation` as secondary text if non-nil (can be done via ProviderCardView or inline)
  - Alternatively update `ClaudeUsage/Views/ProviderCardView.swift` to show `card.confidenceExplanation` as a `.caption` text below the headline

  ## Verification
  1. `xcodebuild build` compiles
  2. `xcodebuild test` — ConfidenceExplanationTests (3) pass
  3. All 105 previously-passing tests still pass
  4. Total: 108 tests, 0 failures

- [x] Step 6.4: [automated] Update user-facing documentation to match multi-provider product.

  **What:** Update README.md with multi-provider feature descriptions, provider setup instructions, and confidence level documentation. Update CLAUDE.md if any conventions changed. No code changes in this step.

  ## Changes

  ### 1. `README.md`
  Add a new "## Multi-Provider Monitoring" section after the existing features table. Include:
  - Brief overview: app now monitors Claude, Codex, and Gemini CLI usage
  - **Provider setup:** for each provider, explain what gets detected and how to enable:
    - Claude: session key in Settings (existing flow)
    - Codex: install Codex CLI, run once, detected automatically
    - Gemini: install Gemini CLI, run once, detected automatically
  - **Confidence levels:** explain the 4 levels:
    - Exact: direct API data (Claude only)
    - High Confidence: limit detection + plan profile configured
    - Estimated: wrapper events or plan profile present
    - Observed Only: activity detected but no plan configured
  - **Accuracy Mode:** optional wrapper mode for Codex/Gemini that captures start/end timestamps and limit-hit signals (no prompt content)
  - Add "Multi-provider monitoring" row to the features comparison table

  ### 2. `CLAUDE.md`
  - Update test count reference from any stale number to 108
  - No convention changes needed

  ## Acceptance criteria
  - README documents all three providers with setup instructions
  - README explains the 4 confidence levels
  - README mentions Accuracy Mode
  - CLAUDE.md test count is current
  - No code files modified
  - `xcodebuild build` still compiles (sanity check)

## Green
- [x] Step 6.5: [automated] Final green-phase verification gate for Phase 6.

  **What:** All tests should pass. Run the full suite, confirm no regressions, and mark Phase 6 milestone complete.

  **Verification checklist:**
  1. `xcodebuild build` — clean compile
  2. `xcodebuild test` — all tests pass (93 existing + ~15 new), 0 failures
  3. Claude files untouched
  4. Codex wrapper/confidence logic untouched (only diagnostics added)
  5. Gemini wrapper/confidence logic untouched (only diagnostics added)

  **Verification checklist (detailed):**
  1. `xcodebuild -scheme ClaudeUsage -destination 'platform=macOS' build` — must succeed
  2. `xcodebuild test -scheme ClaudeUsage -destination 'platform=macOS'` — all 108 tests pass, 0 failures
  3. Verify no changes to core files: `UsageService.swift`, `UsageViewModel.swift` unchanged since Phase 5
  4. Verify `CodexAdapter.swift`, `CodexDetector.swift`, `CodexWrapper.swift` unchanged since Phase 5 (only diagnostics added in Phase 6)
  5. Verify `GeminiAdapter.swift`, `GeminiDetector.swift`, `GeminiWrapper.swift` unchanged since Phase 5

  **Files to modify:**
  - `tasks/todo.md` — check off Step 6.5 and all milestone items
  - `tasks/roadmap.md` — mark Phase 6 milestone complete
  - `tasks/history.md` — append Phase 6 completion record

## Milestone
- [x] Users can understand why each provider is exact, estimated, passive-only, or degraded.
- [x] The app handles stale and degraded states gracefully.
- [x] Product copy and documentation match the multi-provider product.
- [x] All Phase 6 tests pass.
- [x] No regressions in previous phase tests.
