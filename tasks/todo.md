# Phase 4: Gemini Passive Adapter

> Project: ClaudeUsage (macOS menu bar app) · Phase 4 of 7
> Test strategy: tdd
> Prior phases: Phase 1 (shared provider foundation) ✅, Phase 2 (Codex passive adapter) ✅, Phase 3 (Codex accuracy mode wrapper) ✅
> Current test count: 61 passing, 0 expected failures

## Tests First
- [ ] Step 4.1: [automated] Add failing fixture-based tests for Gemini install detection, auth-mode detection, passive request counting, rate-pressure derivation, and confidence labeling under ClaudeUsageTests.

## Implementation
- [ ] Step 4.2: [automated] Implement Gemini local-state discovery and auth-mode detection in a new adapter/service under ClauseUsage/Services.
- [ ] Step 4.3: [automated] Implement incremental parsing for Gemini state/session artifacts and derive passive request cadence, daily headroom, and stale-state behavior.
- [ ] Step 4.4: [automated] Add Gemini quota profiles and confidence logic to the shared provider model under ClaudeUsage/Models.
- [ ] Step 4.5: [automated] Render Gemini-specific provider cards and settings states in ClaudeUsage/Views/ContentView.swift and ClaudeUsage/Views/SettingsView.swift.

## Green
- [ ] Step 4.6: [automated] Make Gemini passive tests pass, rerun all previous phase tests, and verify provider rotation works correctly with all three providers enabled.

## Milestone
- [ ] Gemini can be detected and configured as a monitored provider.
- [ ] Gemini passive monitoring shows auth-mode-aware quota/rate guidance with explicit confidence.
- [ ] Provider rotation and stacked cards work with Claude, Codex, and Gemini together.
- [ ] All Phase 4 tests pass.
- [ ] No regressions in previous phase tests.
