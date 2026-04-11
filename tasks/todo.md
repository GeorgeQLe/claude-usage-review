# Phase 7: Cross-Platform Follow-Through

> Project: ClaudeUsage (macOS menu bar app) · Phase 7 of 7
> Test strategy: tdd
> Prior phases: Phase 1 (shared provider foundation) ✅, Phase 2 (Codex passive adapter) ✅, Phase 3 (Codex accuracy mode wrapper) ✅, Phase 4 (Gemini passive adapter) ✅, Phase 5 (Gemini accuracy mode wrapper) ✅, Phase 6 (onboarding, diagnostics, product hardening) ✅
> Current test count: 108 passing

## Tests First
- Step 7.1: [automated] Add failing Tauri-side model/state tests for the validated provider abstraction in tauri-app/src-tauri/src and corresponding frontend type tests under tauri-app/src when parity work starts.

## Implementation
- Step 7.2: [automated] Port the validated shared provider model and confidence concepts into the Tauri architecture in tauri-app/src-tauri/src/models.rs, tauri-app/src-tauri/src/state.rs, tauri-app/src/types.ts, and the Tauri UI entry files.
- Step 7.3: [automated] Resolve the deferred Windows end-to-end validation against the new product model and document any parity gaps.

## Green
- Step 7.4: [automated] Make Tauri parity tests pass, rerun relevant previous tests, and confirm the cross-platform plan is based on the validated macOS multi-provider model rather than the older Claude-only shape.

## Milestone
- [ ] Cross-platform follow-through is based on the validated multi-provider model.
- [ ] Deferred Windows validation is resolved against the new architecture.
- [ ] Any remaining parity gaps are explicit and documented.
- [ ] All Phase 7 tests pass.
- [ ] No regressions in previous phase tests.
