# Phase 6: Onboarding, Diagnostics, and Product Hardening

> Project: ClauseUsage (macOS menu bar app) · Phase 6 of 7
> Prior phases: Phase 1 (shared provider foundation) ✅, Phase 2 (Codex passive adapter) ✅, Phase 3 (Codex accuracy mode wrapper) ✅, Phase 4 (Gemini passive adapter) ✅, Phase 5 (Gemini accuracy mode wrapper) ✅
> Current test count: 93 passing

## Tests First
- [ ] Step 6.1: [automated] Add failing tests for degraded/stale provider handling, unsupported provider-version handling, onboarding copy/state transitions, and tray behavior edge cases under ClaudeUsageTests.

## Implementation
- [ ] Step 6.2: [automated] Add adapter diagnostics, stale badges, unsupported-version handling, and richer error explanations across the shared provider shell and provider cards.
- [ ] Step 6.3: [automated] Refine onboarding/settings copy and flows for install detection, plan confirmation, wrapper adoption, and privacy disclosures in ClaudeUsage/Views/SettingsView.swift and related view-model files.
- [ ] Step 6.4: [automated] Expand regression/fixture coverage, harden local parsing performance, and update user-facing docs such as README.md and CLAUDE.md to match the multi-provider product.

## Green
- [ ] Step 6.5: [automated] Make hardening tests pass, rerun the full suite, and verify the app remains usable when one provider is unreadable or stale.

## Milestone
- [ ] Users can understand why each provider is exact, estimated, passive-only, or degraded.
- [ ] The app handles stale and degraded states gracefully.
- [ ] Product copy and documentation match the multi-provider product.
- [ ] All Phase 6 tests pass.
- [ ] No regressions in previous phase tests.
