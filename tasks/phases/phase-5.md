# Phase 5: Gemini Accuracy Mode Wrapper

> Project: ClauseUsage (macOS menu bar app) · Phase 5 of 7
> Test strategy: tdd
> Prior phases: Phase 1 (shared provider foundation) ✅, Phase 2 (Codex passive adapter) ✅, Phase 3 (Codex accuracy mode wrapper) ✅, Phase 4 (Gemini passive adapter) ✅
> Test count: 78 → 93 passing

## Tests First
- [x] Step 5.1: Add 15 failing tests for Gemini wrapper event capture, event-ledger persistence, confidence upgrades, and privacy constraints in `ClaudeUsageTests/GeminiWrapperTests.swift`.

## Implementation
- [x] Step 5.2: Add `GeminiInvocationEvent` struct and `GeminiEventLedger` class. Update `GeminiConfidenceEngine.evaluate()` to accept `wrapperEvents:` parameter.
- [x] Step 5.3: Implement `GeminiWrapper` launcher in `ClaudeUsage/Services/GeminiWrapper.swift`. Add `geminiAccuracyMode` toggle to `ProviderSettingsStore`.
- [x] Step 5.4: Wire `GeminiEventLedger` into `GeminiAdapter.refresh()`. Add Accuracy Mode toggle to `SettingsView`.

## Green
- [x] Step 5.5: Final verification gate — 93 tests pass, 0 failures. Claude and Codex adapters untouched. Passive-only path confirmed.

## Milestone
- [x] Gemini Accuracy Mode can be enabled independently.
- [x] Structured wrapper telemetry improves Gemini request counting and freshness.
- [x] Passive-only Gemini usage remains fully supported.
- [x] All Phase 5 tests pass.
- [x] No regressions in previous phase tests.

## On Completion
Phase 5 completed 2026-04-10. All 15 Gemini wrapper tests pass alongside 78 existing tests (93 total). Gemini Accuracy Mode mirrors the Codex pattern exactly: `GeminiInvocationEvent` → `GeminiEventLedger` → `GeminiWrapper` → `GeminiAdapter` integration → `SettingsView` toggle. No Claude or Codex files modified.
