# Phase 5: Gemini Accuracy Mode Wrapper

> Project: ClauseUsage (macOS menu bar app) · Phase 5 of 7
> Test strategy: tdd
> Prior phases: Phase 1 (shared provider foundation) ✅, Phase 2 (Codex passive adapter) ✅, Phase 3 (Codex accuracy mode wrapper) ✅, Phase 4 (Gemini passive adapter) ✅
> Current test count: 78 passing

## Tests First
- [ ] Step 5.1: [automated] Add failing tests for Gemini wrapper event capture, structured-output ingestion, event-ledger persistence, and confidence upgrades under ClaudeUsageTests.

## Implementation
- [ ] Step 5.2: [automated] Implement an opt-in Gemini wrapper/launcher and wrapper configuration in new files under ClaudeUsage/Services.
- [ ] Step 5.3: [automated] Add structured-event ingestion for Gemini wrapper runs and merge wrapper-derived telemetry with passive Gemini state.
- [ ] Step 5.4: [automated] Expose Gemini Accuracy Mode controls, status, and explanations in ClaudeUsage/Views/SettingsView.swift and ClaudeUsage/Views/ContentView.swift.

## Green
- [ ] Step 5.5: [automated] Make Gemini wrapper tests pass, rerun all previous phase tests, and verify passive-only users still work without enabling wrappers.

## Milestone
- [ ] Gemini Accuracy Mode can be enabled independently.
- [ ] Structured wrapper telemetry improves Gemini request counting and freshness.
- [ ] Passive-only Gemini usage remains fully supported.
- [ ] All Phase 5 tests pass.
- [ ] No regressions in previous phase tests.
