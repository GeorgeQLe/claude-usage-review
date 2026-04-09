# Phase 2: Codex Passive Adapter

## Tests First
- [ ] Step 2.1: [automated] Add failing fixture-based tests for Codex install detection, auth presence detection, passive activity parsing, cooldown detection, and confidence labeling in new test files under ClaudeUsageTests with sample data fixtures derived from `~/.codex` formats.

## Implementation
- [ ] Step 2.2: [automated] Implement Codex local-state discovery and non-secret auth/install detection in a new adapter/service under ClaudeUsage/Services.
- [ ] Step 2.3: [automated] Implement incremental parsing for Codex passive sources such as `history.jsonl`, logs, and recent SQLite-derived signals, with bookmarks and stale-state handling in new Codex parsing/storage files under ClaudeUsage/Services.
- [ ] Step 2.4: [automated] Add Codex plan profiles, confidence rules, and estimate/headroom derivation into the shared provider model under ClaudeUsage/Models.
- [ ] Step 2.5: [automated] Render a provider-specific Codex card, tray headline, and degraded/error states in ClaudeUsage/Views/ContentView.swift, ClaudeUsage/Views/SettingsView.swift, and any new provider-specific view files.

## Green
- [ ] Step 2.6: [automated] Make Codex passive tests pass, run the existing Claude/provider-shell tests, and verify Codex never claims an exact remaining quota without an exact source.

## Milestone
- [ ] Codex can be detected and configured as a monitored provider.
- [ ] Codex passive monitoring shows observed local activity, estimate/headroom guidance, and explicit confidence.
- [ ] Unknown or degraded Codex states remain visible and explained.
- [ ] Claude behavior remains unchanged while Codex is enabled.
- [ ] All Phase 2 tests pass.
- [ ] No regressions in previous phase tests.
