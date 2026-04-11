# Phase 7: Cross-Platform Follow-Through

> Project: ClaudeUsage (macOS menu bar app + Tauri cross-platform app) · Phase 7 of 7
> Test strategy: tdd
> Prior phases: Phase 1 (shared provider foundation) ✅, Phase 2 (Codex passive adapter) ✅, Phase 3 (Codex accuracy mode wrapper) ✅, Phase 4 (Gemini passive adapter) ✅, Phase 5 (Gemini accuracy mode wrapper) ✅, Phase 6 (onboarding, diagnostics, product hardening) ✅
> Current test count: 108 macOS tests passing, 2 Tauri Rust tests passing

## Tests First
- [x] Step 7.1: [automated] Add failing Rust tests for multi-provider model types, provider snapshot serialization, confidence labels, card state mapping, and tray text generation.

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
- [x] Step 7.2: [automated] Implement the three `todo!()` method bodies to turn red tests green.

  **What:** Fill in the three stub methods in `tauri-app/src-tauri/src/provider_types.rs`. No new types needed — all types, enums, and structs already exist from Step 7.1.

  **Exactly what to implement:**

  1. **`ProviderSnapshot::id()`** (line ~85) — match on self, return `ProviderId`:
     - `ClaudeRich { .. } | ClaudeSimple { .. }` → `ProviderId::Claude`
     - `Codex { .. } | CodexRich { .. }` → `ProviderId::Codex`
     - `Gemini { .. } | GeminiRich { .. }` → `ProviderId::Gemini`

  2. **`ConfidenceLevel::explanation()`** (line ~46) — match on self, return `&'static str`:
     - `Exact` → `"Exact usage from API"`
     - `HighConfidence` → `"High confidence from limit detection and plan profile"`
     - `Estimated` → `"Estimated from wrapper events and plan profile"`
     - `ObservedOnly` → `"Observed activity only — configure a plan for better accuracy"`
     (These match the Swift `CodexConfidenceEngine.explanation()` strings exactly)

  3. **`ShellState::tray_provider()`** (line ~110) — return first provider with `card_state == CardState::Configured`:
     ```rust
     self.providers.iter().find(|p| p.card_state == CardState::Configured)
     ```

  **Files to modify:**
  - `tauri-app/src-tauri/src/provider_types.rs` — replace 3 `todo!()` bodies (no other changes)

  **Acceptance criteria:**
  - `cargo build` compiles
  - `cargo test` — all 17 tests pass (15 new + 2 existing api.rs)
  - No changes to `models.rs` or any other file

- [ ] Step 7.3: [automated] Mirror provider types in Tauri frontend TypeScript and add card rendering.

  **What:** Add TypeScript interfaces matching Rust provider types. Extend `UsageState` with optional `provider_cards`. Add card rendering to popover (progressive enhancement — Claude-only path still works).

  **Files to modify:**
  - `tauri-app/src/types.ts` — add `ProviderId`, `CardState`, `ConfidenceLevel`, `ProviderCard` interfaces; add optional `provider_cards` to `UsageState`
  - `tauri-app/src/main.ts` — add provider card rendering below existing usage bars
  - `tauri-app/src/styles.css` — add `.provider-card`, `.confidence-badge`, `.stale-badge` styles

  **Implementation details:**

  ### 1. `tauri-app/src/types.ts` — add types after existing interfaces

  Add these types (must match Rust `#[serde(rename_all = "snake_case")]` serialization):
  ```typescript
  export type ProviderId = "claude" | "codex" | "gemini";
  export type CardState = "configured" | "missing_configuration" | "degraded" | "stale";
  export type ConfidenceLevel = "exact" | "high_confidence" | "estimated" | "observed_only";

  export interface ProviderCard {
    id: ProviderId;
    card_state: CardState;
    headline: string;
    detail_text: string | null;
    session_utilization: number | null;
    weekly_utilization: number | null;
    confidence_explanation: string | null;
  }
  ```

  Add to `UsageState` interface (after `highest_utilization`):
  ```typescript
  provider_cards: ProviderCard[] | null;
  ```

  ### 2. `tauri-app/src/main.ts` — add card rendering

  In `render()`, after the existing usage bars section, add a provider cards section:
  - Guard: only render if `state.provider_cards` is non-null and non-empty
  - For each `ProviderCard`:
    - Render a `.provider-card` div with provider name as header
    - Show `headline` text
    - If `session_utilization` is non-null, render a mini usage bar (reuse `.usage-bar` pattern)
    - If `confidence_explanation` is non-null, show it as a `.confidence-badge` caption
    - If `card_state === "stale"`, add a `.stale-badge` label
    - If `card_state === "degraded"`, add a `.degraded-badge` label
    - If `card_state === "missing_configuration"`, show a muted "Not configured" message
  - Provider display names: `claude` → "Claude", `codex` → "Codex CLI", `gemini` → "Gemini CLI"

  ### 3. `tauri-app/src/styles.css` — add card styles

  Add after existing component styles:
  ```css
  /* Provider cards */
  .provider-card { ... }          /* card container, subtle border, padding, margin-top */
  .provider-card-header { ... }   /* provider name, bold */
  .provider-card-headline { ... } /* headline text */
  .confidence-badge { ... }       /* small muted caption text */
  .stale-badge { ... }            /* yellow warning pill */
  .degraded-badge { ... }         /* red warning pill */
  ```
  Follow existing dark theme (CSS variables already defined). Match `.usage-bar` pattern for utilization bars.

  **Key decisions:**
  - Progressive enhancement: if `provider_cards` is null, nothing changes — existing Claude-only view works as before
  - No test framework for Tauri frontend (vanilla TS) — verification is `npm run build` compiles + visual inspection
  - Provider cards appear below existing usage bars, not replacing them

  **Acceptance criteria:**
  - `npm run build` compiles with no errors
  - Types match Rust `ProviderCard` serialization exactly (snake_case fields, snake_case enum values)
  - Cards render when `provider_cards` present; existing Claude view works when absent
  - Stale/degraded/missing_configuration states have distinct visual treatment

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
