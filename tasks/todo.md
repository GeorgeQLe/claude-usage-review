# Phase 7: Cross-Platform Follow-Through

> Project: ClaudeUsage (macOS menu bar app + Tauri cross-platform app) · Phase 7 of 7
> Test strategy: tdd
> Prior phases: Phase 1 (shared provider foundation) ✅, Phase 2 (Codex passive adapter) ✅, Phase 3 (Codex accuracy mode wrapper) ✅, Phase 4 (Gemini passive adapter) ✅, Phase 5 (Gemini accuracy mode wrapper) ✅, Phase 6 (onboarding, diagnostics, product hardening) ✅
> Current test count: 108 macOS tests passing, 2 Tauri Rust tests passing

## Tests First
- [ ] Step 7.1: [automated] Add failing Rust tests for multi-provider model types, provider snapshot serialization, confidence labels, card state mapping, and tray text generation.

  **What:** Write red-phase Rust unit tests in a new `provider_types.rs` module that define the provider abstraction contract before porting implementation. Tests use `#[cfg(test)] mod tests` blocks. No frontend test framework (Tauri frontend is vanilla TS with no test runner).

  **Files to create:**
  - `tauri-app/src-tauri/src/provider_types.rs` — new module with empty/stub types and `#[cfg(test)]` test module containing:

  **ProviderModelTests** (~5 tests):
  - `test_provider_id_variants` — `ProviderId` enum has Claude, Codex, Gemini variants
  - `test_provider_snapshot_claude_rich` — ClaudeRich variant holds `UsageData` + `AuthStatus` + `is_enabled`
  - `test_provider_snapshot_codex_rich` — CodexRich variant holds `CodexEstimate` + `is_enabled`
  - `test_provider_snapshot_gemini_rich` — GeminiRich variant holds `GeminiEstimate` + `is_enabled`
  - `test_provider_snapshot_id_extraction` — `.id()` returns correct `ProviderId` for each variant

  **CardStateTests** (~4 tests):
  - `test_card_state_configured` — `CardState::Configured` serializes to `"configured"`
  - `test_card_state_stale` — `CardState::Stale` serializes to `"stale"`
  - `test_card_state_degraded` — `CardState::Degraded` serializes to `"degraded"`
  - `test_provider_card_serialization` — `ProviderCard` struct serializes to JSON with all expected fields

  **ConfidenceTests** (~3 tests):
  - `test_confidence_label_variants` — `ConfidenceLevel` has exact/highConfidence/estimated/observedOnly
  - `test_confidence_explanation_observed_only` — explanation for ObservedOnly contains "plan"
  - `test_confidence_explanation_high_confidence` — explanation for HighConfidence contains "limit"

  **ShellStateTests** (~3 tests):
  - `test_shell_state_tray_provider_prefers_configured` — `tray_provider()` returns first configured card
  - `test_shell_state_skips_degraded` — `tray_provider()` skips degraded cards
  - `test_shell_state_empty_providers` — empty providers → `tray_provider()` returns None

  **Files to modify:**
  - `tauri-app/src-tauri/src/lib.rs` — add `mod provider_types;`

  **Acceptance criteria:**
  - `cargo build` in `tauri-app/src-tauri/` compiles
  - `cargo test` fails with expected assertion failures (red phase)
  - Existing 2 cookie-parsing tests in `api.rs` still pass

## Implementation
- [ ] Step 7.2: [automated] Add provider type definitions and coordinator logic to Tauri Rust backend.

  **What:** Port the macOS Swift `ProviderTypes.swift` model into Rust. Add `ProviderId`, `ProviderStatus`, `CardState`, `ProviderSnapshot`, `ProviderCard`, `ShellState`, `ConfidenceLevel`, and coordinator logic. Existing Claude-only types in `models.rs` stay unchanged.

  **Context:** The Swift model lives in `ClaudeUsage/Models/ProviderTypes.swift`. Key types to port:
  - `ProviderId` (claude/codex/gemini)
  - `CardState` (configured/missingConfiguration/degraded/stale)
  - `ProviderSnapshot` (enum with 6 variants: claudeRich, claudeSimple, codexSimple, codexRich, geminiSimple, geminiRich)
  - `ProviderCard` (id, cardState, headline, detailText, sessionUtilization, weeklyUtilization, confidenceExplanation)
  - `ShellState` (providers array + tray_provider computed property)
  - `ProviderCoordinator` with `make_shell_state()` mapping snapshots → cards

  **Files to modify:**
  - `tauri-app/src-tauri/src/provider_types.rs` — fill in all type definitions and coordinator logic
  - `tauri-app/src-tauri/src/models.rs` — no changes

  **Acceptance criteria:**
  - `cargo build` compiles
  - All 15 red-phase tests pass
  - Existing 2 `api.rs` tests still pass

- [ ] Step 7.3: [automated] Mirror provider types in Tauri frontend TypeScript and add card rendering.

  **What:** Add TypeScript interfaces matching Rust provider types. Extend `UsageState` with optional `provider_cards`. Add card rendering to popover (progressive enhancement — Claude-only path still works).

  **Files to modify:**
  - `tauri-app/src/types.ts` — add `ProviderId`, `CardState`, `ConfidenceLevel`, `ProviderCard` interfaces; add optional `provider_cards` to `UsageState`
  - `tauri-app/src/main.ts` — add provider card rendering below existing usage bars
  - `tauri-app/src/styles.css` — add `.provider-card`, `.confidence-badge`, `.stale-badge` styles

  **Acceptance criteria:**
  - `npm run build` compiles
  - Types match Rust serialization
  - Cards render when `provider_cards` present; existing Claude view works when absent

- [ ] Step 7.4: [automated] Wire provider coordinator into AppState and emit cards on polling.

  **What:** Integrate `ProviderCoordinator` into `AppState`. After each Claude poll, build `ProviderSnapshot::ClaudeRich` and run `make_shell_state()` to populate `provider_cards` in `UsageState`.

  **Files to modify:**
  - `tauri-app/src-tauri/src/state.rs` — add coordinator to AppState; build provider card after poll
  - `tauri-app/src-tauri/src/models.rs` — add `provider_cards: Option<Vec<ProviderCard>>` to `UsageState`
  - `tauri-app/src-tauri/src/commands.rs` — ensure `get_usage_state` returns the new field

  **Acceptance criteria:**
  - `cargo build` and `cargo test` pass
  - Claude account produces a `ProviderCard` in `UsageState`

- [ ] Step 7.5: [automated] Audit parity gaps and document them.

  **What:** Compare macOS and Tauri feature sets. Document ported, deferred, and gap status for every feature.

  **Files to create:**
  - `docs/cross-platform-parity.md` — gap analysis (ported vs. deferred vs. gaps)

  **Files to modify:**
  - `tauri-app/README.md` — add multi-provider status note

  **Acceptance criteria:**
  - Every macOS feature listed with status
  - No code changes

## Green
- [ ] Step 7.6: [automated] Final verification gate for Phase 7.

  **Verification:**
  1. `cargo test` in `tauri-app/src-tauri/` — all tests pass
  2. `npm run build` in `tauri-app/` — frontend compiles
  3. `xcodebuild test -scheme ClaudeUsage -destination 'platform=macOS'` — 108 tests pass
  4. Parity document exists

  **Files to modify:**
  - `tasks/todo.md` — check off Step 7.6 and milestones
  - `tasks/roadmap.md` — mark Phase 7 complete
  - `tasks/history.md` — append completion record

## Milestone
- [ ] Cross-platform follow-through is based on the validated multi-provider model.
- [ ] Deferred Windows validation is resolved against the new architecture.
- [ ] Any remaining parity gaps are explicit and documented.
- [ ] All Phase 7 tests pass.
- [ ] No regressions in previous phase tests.
