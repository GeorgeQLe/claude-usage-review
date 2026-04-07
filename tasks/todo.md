# Phase 1: Shared Provider Foundation

## Tests First
- [ ] Step 1.1: [automated] Add failing Swift tests for provider aggregation, rotating tray selection, provider pinning, and Claude non-regression in `ClaudeUsageTests`.

## Implementation
- [ ] Step 1.2: [automated] Introduce provider-aware domain types for shared provider state, confidence labels, plan/auth configuration, and tray rotation policy in `ClaudeUsage/Models/`.
- [ ] Step 1.3: [automated] Add a provider coordinator/store that maps the existing Claude `UsageViewModel` output into the new provider shell without altering Claude fetching behavior.
- [ ] Step 1.4: [automated] Update the menu bar and popover shell for rotating provider headlines, manual override, pinning, and stacked provider cards in `ClaudeUsageApp.swift`, `AppDelegate.swift`, and `Views/ContentView.swift`.
- [ ] Step 1.5: [automated] Extend settings/onboarding for provider enablement, plan/auth confirmation, and local install detection entry points in `Views/SettingsView.swift`, `Services/AccountStore.swift`, and related persistence files.

## Green
- [ ] Step 1.6: [automated] Make the new provider-shell tests pass, verify the existing Claude tests still pass, and run macOS build/test checks for the updated shell.

## Milestone
- [ ] Provider-aware state exists and can represent Claude, Codex, and Gemini side by side.
- [ ] Claude still renders through the current ingestion path with no fetch/auth behavior changes.
- [ ] The tray rotates across enabled providers, supports manual override, and supports pinning.
- [ ] The popover can show stacked provider cards for configured, missing, and degraded providers.
- [ ] All Phase 1 tests pass.
- [ ] No regressions in previous phase tests.
