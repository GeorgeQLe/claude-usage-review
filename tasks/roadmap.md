# Multi-Provider CLI Monitor — Phase Plan

Build the macOS app into a multi-provider CLI usage monitor for Claude Code, Codex, and Gemini while preserving the existing Claude ingestion path exactly as it works today. The critical path is: establish a provider-aware app shell without regressing Claude, ship Codex passive monitoring, add the Codex wrapper for higher-confidence telemetry, then repeat the pattern for Gemini before hardening and cross-platform follow-through.

| Phase | Focus | Outcome |
| --- | --- | --- |
| 1 | Shared provider foundation | Provider-aware state, rotating tray, stacked popover, Claude preserved |
| 2 | Codex passive adapter | Codex detection, passive estimation, confidence labeling |
| 3 | Codex wrapper | Optional Accuracy Mode and event ledger for Codex |
| 4 | Gemini passive adapter | Gemini detection, passive quota/rate tracking |
| 5 | Gemini wrapper | Optional Accuracy Mode and event ledger for Gemini |
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
- Step 2.1: [automated] Add failing fixture-based tests for Codex install detection, auth presence detection, passive activity parsing, cooldown detection, and confidence labeling in new test files under [ClaudeUsageTests](/home/georgeqle/projects/tools/dev/claude-review-usage/ClaudeUsageTests) with sample data fixtures derived from `~/.codex` formats.

### Implementation
- Step 2.2: [automated] Implement Codex local-state discovery and non-secret auth/install detection in a new adapter/service under [ClaudeUsage/Services](/home/georgeqle/projects/tools/dev/claude-review-usage/ClaudeUsage/Services).
- Step 2.3: [automated] Implement incremental parsing for Codex passive sources such as `history.jsonl`, logs, and recent SQLite-derived signals, with bookmarks and stale-state handling in new Codex parsing/storage files under [ClaudeUsage/Services](/home/georgeqle/projects/tools/dev/claude-review-usage/ClaudeUsage/Services).
- Step 2.4: [automated] Add Codex plan profiles, confidence rules, and estimate/headroom derivation into the shared provider model under [ClaudeUsage/Models](/home/georgeqle/projects/tools/dev/claude-review-usage/ClaudeUsage/Models).
- Step 2.5: [automated] Render a provider-specific Codex card, tray headline, and degraded/error states in [ClaudeUsage/Views/ContentView.swift](/home/georgeqle/projects/tools/dev/claude-review-usage/ClaudeUsage/Views/ContentView.swift), [ClaudeUsage/Views/SettingsView.swift](/home/georgeqle/projects/tools/dev/claude-review-usage/ClaudeUsage/Views/SettingsView.swift), and any new provider-specific view files.

### Green
- Step 2.6: [automated] Make Codex passive tests pass, run the existing Claude/provider-shell tests, and verify Codex never claims an exact remaining quota without an exact source.

### Milestone
- Codex can be detected and configured as a monitored provider.
- Codex passive monitoring shows observed local activity, estimate/headroom guidance, and explicit confidence.
- Unknown or degraded Codex states remain visible and explained.
- Claude behavior remains unchanged while Codex is enabled.
- All Phase 2 tests pass.
- No regressions in previous phase tests.

## Phase 3: Codex Accuracy Mode Wrapper

### Tests First
- Step 3.1: [automated] Add failing tests for Codex wrapper event capture, event-ledger persistence, confidence upgrades, and privacy constraints under [ClaudeUsageTests](/home/georgeqle/projects/tools/dev/claude-review-usage/ClaudeUsageTests).

### Implementation
- Step 3.2: [automated] Implement an opt-in Codex wrapper/launcher, wrapper configuration, and invocation event models in new files under [ClaudeUsage/Services](/home/georgeqle/projects/tools/dev/claude-review-usage/ClaudeUsage/Services) and [ClaudeUsage/Models](/home/georgeqle/projects/tools/dev/claude-review-usage/ClaudeUsage/Models).
- Step 3.3: [automated] Add a local event ledger that records invocation timing, observable mode, and limit-hit/reset signals without storing raw prompt content.
- Step 3.4: [automated] Merge wrapper-derived Codex telemetry with passive Codex state and surface Accuracy Mode onboarding/settings controls in [ClaudeUsage/Views/SettingsView.swift](/home/georgeqle/projects/tools/dev/claude-review-usage/ClaudeUsage/Views/SettingsView.swift) and [ClaudeUsage/Views/ContentView.swift](/home/georgeqle/projects/tools/dev/claude-review-usage/ClaudeUsage/Views/ContentView.swift).

### Green
- Step 3.5: [automated] Make Codex wrapper tests pass, rerun all Phase 1-2 tests, and verify that Codex Accuracy Mode improves freshness/confidence without affecting Claude.

### Milestone
- Codex Accuracy Mode can be enabled independently.
- Wrapper-derived Codex events improve confidence and update latency.
- Derived telemetry only is stored; raw prompt bodies are not persisted.
- Claude remains unaffected when Codex wrapper mode is on.
- All Phase 3 tests pass.
- No regressions in previous phase tests.

## Phase 4: Gemini Passive Adapter

### Tests First
- Step 4.1: [automated] Add failing fixture-based tests for Gemini install detection, auth-mode detection, passive request counting, rate-pressure derivation, and confidence labeling under [ClaudeUsageTests](/home/georgeqle/projects/tools/dev/claude-review-usage/ClaudeUsageTests).

### Implementation
- Step 4.2: [automated] Implement Gemini local-state discovery and auth-mode detection in a new adapter/service under [ClaudeUsage/Services](/home/georgeqle/projects/tools/dev/claude-review-usage/ClaudeUsage/Services).
- Step 4.3: [automated] Implement incremental parsing for Gemini state/session artifacts and derive passive request cadence, daily headroom, and stale-state behavior.
- Step 4.4: [automated] Add Gemini quota profiles and confidence logic to the shared provider model under [ClaudeUsage/Models](/home/georgeqle/projects/tools/dev/claude-review-usage/ClaudeUsage/Models).
- Step 4.5: [automated] Render Gemini-specific provider cards and settings states in [ClaudeUsage/Views/ContentView.swift](/home/georgeqle/projects/tools/dev/claude-review-usage/ClaudeUsage/Views/ContentView.swift) and [ClaudeUsage/Views/SettingsView.swift](/home/georgeqle/projects/tools/dev/claude-review-usage/ClaudeUsage/Views/SettingsView.swift).

### Green
- Step 4.6: [automated] Make Gemini passive tests pass, rerun all previous phase tests, and verify provider rotation works correctly with all three providers enabled.

### Milestone
- Gemini can be detected and configured as a monitored provider.
- Gemini passive monitoring shows auth-mode-aware quota/rate guidance with explicit confidence.
- Provider rotation and stacked cards work with Claude, Codex, and Gemini together.
- All Phase 4 tests pass.
- No regressions in previous phase tests.

## Phase 5: Gemini Accuracy Mode Wrapper

### Tests First
- Step 5.1: [automated] Add failing tests for Gemini wrapper event capture, structured-output ingestion, event-ledger persistence, and confidence upgrades under [ClaudeUsageTests](/home/georgeqle/projects/tools/dev/claude-review-usage/ClaudeUsageTests).

### Implementation
- Step 5.2: [automated] Implement an opt-in Gemini wrapper/launcher and wrapper configuration in new files under [ClaudeUsage/Services](/home/georgeqle/projects/tools/dev/claude-review-usage/ClaudeUsage/Services).
- Step 5.3: [automated] Add structured-event ingestion for Gemini wrapper runs and merge wrapper-derived telemetry with passive Gemini state.
- Step 5.4: [automated] Expose Gemini Accuracy Mode controls, status, and explanations in [ClaudeUsage/Views/SettingsView.swift](/home/georgeqle/projects/tools/dev/claude-review-usage/ClaudeUsage/Views/SettingsView.swift) and [ClaudeUsage/Views/ContentView.swift](/home/georgeqle/projects/tools/dev/claude-review-usage/ClaudeUsage/Views/ContentView.swift).

### Green
- Step 5.5: [automated] Make Gemini wrapper tests pass, rerun all previous phase tests, and verify passive-only users still work without enabling wrappers.

### Milestone
- Gemini Accuracy Mode can be enabled independently.
- Structured wrapper telemetry improves Gemini request counting and freshness.
- Passive-only Gemini usage remains fully supported.
- All Phase 5 tests pass.
- No regressions in previous phase tests.

## Phase 6: Onboarding, Diagnostics, and Product Hardening

### Tests First
- Step 6.1: [automated] Add failing tests for degraded/stale provider handling, unsupported provider-version handling, onboarding copy/state transitions, and tray behavior edge cases under [ClaudeUsageTests](/home/georgeqle/projects/tools/dev/claude-review-usage/ClaudeUsageTests).

### Implementation
- Step 6.2: [automated] Add adapter diagnostics, stale badges, unsupported-version handling, and richer error explanations across the shared provider shell and provider cards.
- Step 6.3: [automated] Refine onboarding/settings copy and flows for install detection, plan confirmation, wrapper adoption, and privacy disclosures in [ClaudeUsage/Views/SettingsView.swift](/home/georgeqle/projects/tools/dev/claude-review-usage/ClaudeUsage/Views/SettingsView.swift) and related view-model files.
- Step 6.4: [automated] Expand regression/fixture coverage, harden local parsing performance, and update user-facing docs such as [README.md](/home/georgeqle/projects/tools/dev/claude-review-usage/README.md) and [CLAUDE.md](/home/georgeqle/projects/tools/dev/claude-review-usage/CLAUDE.md) to match the multi-provider product.

### Green
- Step 6.5: [automated] Make hardening tests pass, rerun the full suite, and verify the app remains usable when one provider is unreadable or stale.

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
