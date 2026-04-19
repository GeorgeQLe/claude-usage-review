# Phase 5: Accuracy Mode Wrappers

> Project: ClaudeUsage Electron cross-platform app
> Source: `tasks/roadmap.md`
> Scope: Add explicit opt-in Codex/Gemini Accuracy Mode wrappers, setup verification, wrapper event ledgers, confidence upgrades, and privacy-preserving UI.
> Test strategy: tdd
> Status: active as of 2026-04-17

### Execution Profile
**Parallel mode:** serial
**Integration owner:** main agent
**Conflict risk:** high
**Review gates:** correctness, tests, security, privacy, UX

**Subagent lanes:** none

## Tests First
- [x] Step 5.1: [automated] Add failing tests for wrapper script generation, setup-command rendering, setup verification, wrapper event ledgers, stderr limit-hit scanning, confidence upgrades from wrapper events, and privacy constraints proving no prompts/stdout/secrets are persisted.

  **Implementation plan for Step 5.1:**
  - Add wrapper generation red tests under `electron-app/src/main/wrappers/`, likely `generator.test.ts`, `verification.test.ts`, and `events.test.ts`. Cover Codex and Gemini wrapper metadata, deterministic wrapper paths in an injected app user data directory, versioned generated scripts, shell-safe setup commands, removal instructions, and the explicit guarantee that the app never mutates shell profiles, PowerShell profiles, or PATH automatically.
  - Add wrapper verification red tests around injectable filesystem/process helpers. Cover resolving `codex` and `gemini` command paths, detecting when each command points at the generated wrapper, detecting native CLI targets, running only harmless version/status probes through a fake runner, classifying missing commands, and returning sanitized verification messages through IPC.
  - Add SQLite wrapper event ledger red tests under `electron-app/src/main/storage/` or `electron-app/src/main/wrappers/`. Cover inserting invocation start/end records into the existing `wrapper_events` table, provider/invocation uniqueness, duration calculation, command mode/model/exit status capture, limit-hit flagging, provider/time queries, trimming or bounded reads, and diagnostics summaries that never include prompt text, stdout, tokens, cookies, or raw stderr.
  - Add wrapper stderr scanner tests with in-memory strings only. Cover Codex and Gemini usage-limit, rate-limit, lockout, cooldown, and reset hints while asserting stdout is ignored and redacted diagnostics do not preserve raw command output.
  - Add provider confidence integration red tests in `electron-app/src/main/providers/codex/adapter.test.ts`, `electron-app/src/main/providers/gemini/adapter.test.ts`, and/or `electron-app/src/shared/confidence/providerConfidence.test.ts`. Cover wrapper events upgrading passive provider cards to `estimated` or `high_confidence` only where justified, preserving passive fallback when wrappers are disabled or unverifiable, and keeping Codex from claiming `exact`.
  - Add IPC/preload/renderer red tests in `electron-app/src/main/ipc.test.ts`, `electron-app/src/foundation-renderer.test.tsx`, and shared schema tests. Cover `wrappers:generate`, `wrappers:verify`, Accuracy Mode settings toggles, setup instructions in settings/onboarding, verification status, troubleshooting/removal copy, and secret-free renderer state.
  - Keep the tests red for missing wrapper modules and wiring. Validate the red phase with focused `npm test -- --run` paths, then run `npm run typecheck` if the test imports are written to typecheck through intentional runtime failures. Do not implement wrapper production modules in this step.

  **Result for Step 5.1:**
  - Added Phase 5 red tests for wrapper generation, setup verification, stderr limit scanning, wrapper event ledger storage, wrapper-driven confidence upgrades, IPC/schema contracts, and Accuracy Mode settings/onboarding privacy copy.
  - Focused validation is red as expected with 15 failures covering missing wrapper modules (`generator`, `verification`, `stderrScanner`, `wrapperEvents`), missing wrapper IPC dependency routing, narrow wrapper schemas, adapters ignoring wrapper events, and missing Accuracy Mode UI copy/actions.
  - `npm run typecheck` passes from `electron-app/`, so the red contracts are type-safe. Accepted warning: Node's experimental SQLite warning during the wrapper event storage red tests.

## Implementation
- [x] Step 5.2: [automated] Implement wrapper generation under `electron-app/src/main/wrappers/`: per-provider wrapper scripts/binaries in the app user data directory, versioning, safe removal instructions, and no automatic shell/PATH mutation.

  **Implementation plan for Step 5.2:**
  - Create wrapper generator modules under `electron-app/src/main/wrappers/`, including provider metadata, generated script templates, setup command builders, removal instruction builders, and filesystem helpers with injectable app user data paths for tests.
  - Generate Codex and Gemini wrappers into app-owned support storage, not into user shell/profile directories. Scripts should call through to the resolved native CLI target, append only derived invocation metadata through the app-owned event path, and avoid capturing stdout or prompt arguments beyond safe command-mode/model hints.
  - Keep shell/PATH changes manual: return commands/instructions that the user can run, but never edit `.zshrc`, `.bashrc`, PowerShell profiles, system PATH, or symlink locations automatically.
  - Wire `wrappers:generate` through `electron-app/src/main/ipc.ts`, `electron-app/src/preload/api.ts`, shared IPC schemas/types, and placeholder runtime dependencies so renderer calls receive validated setup instructions.
  - Validate with focused wrapper generation and IPC tests, then `npm run typecheck` from `electron-app/`.

  **Result for Step 5.2:**
  - Added `electron-app/src/main/wrappers/generator.ts` with deterministic Codex/Gemini wrapper generation, app-user-data wrapper paths, versioned script metadata, manual setup/removal instructions, privacy-scoped derived event emission, native CLI path resolution, and app-owned file persistence.
  - Extended shared wrapper setup/verification IPC schemas and types so setup instructions, wrapper paths, wrapper versions, manual removal instructions, and no-shell-mutation guarantees survive validation.
  - Routed wrapper generation through injected IPC dependencies and wired the Electron runtime to generate wrappers under `app.getPath("userData")` without editing shell profiles, PowerShell profiles, system PATH, or symlink locations.
  - Focused validation passed: `npm test -- --run src/main/wrappers/generator.test.ts src/main/ipc.test.ts src/foundation-schemas.test.ts` and `npm run typecheck` from `electron-app/`. Full test/build remain intentionally deferred because later Phase 5 verification/event/UI red suites are still assigned to Steps 5.3-5.8.

- [x] Step 5.3: [automated] Implement setup verification for Codex and Gemini wrappers: resolve command paths, detect whether `codex`/`gemini` points at the wrapper, run harmless version/status probes where safe, and report status through IPC.

  **Implementation plan for Step 5.3:**
  - Add verification modules under `electron-app/src/main/wrappers/` with injectable process execution and filesystem lookup boundaries. Do not run interactive provider commands in tests.
  - Detect missing native CLIs, direct native CLI usage, generated wrapper usage, wrapper version mismatch, and ambiguous command resolution. Return provider-specific, user-actionable status without exposing shell environment dumps or command output.
  - Limit live probes to harmless version/status checks behind the injected runner, with timeout/error classification and redacted messages.
  - Wire verification results into `wrappers:verify` IPC/preload contracts and settings/onboarding-facing renderer state.
  - Validate with focused verification/IPC/renderer tests, then `npm run typecheck` from `electron-app/`.

  **Result for Step 5.3:**
  - Added `electron-app/src/main/wrappers/verification.ts` with injectable command resolution, native CLI probing, generated-wrapper detection, stale-wrapper detection, and sanitized provider-specific verification statuses for Codex and Gemini.
  - Wired runtime `wrappers:verify` to verify app-owned wrapper paths under `app.getPath("userData")`, resolve the public CLI from PATH, resolve the native CLI while excluding the wrapper root, and run only harmless `--version` probes.
  - Updated shared IPC schemas/types for the Step 5.3 statuses: `missing_command`, `native_cli_active`, `wrapper_active`, `stale_wrapper`, and `unverified`.
  - Focused validation passed: `npm test -- --run src/main/wrappers/verification.test.ts src/main/ipc.test.ts src/foundation-schemas.test.ts` and `npm run typecheck` from `electron-app/`.
  - Expected red validation remains for future Step 5.6 UI work: `npm test -- --run src/foundation-renderer.test.tsx` fails only the existing Accuracy Mode settings/onboarding copy/control assertions.

- [x] Step 5.4: [automated] Implement wrapper event ledgers in SQLite for Codex and Gemini: invocation ID, start/end, duration, command mode, model, exit status, limit-hit flag, wrapper version, and source provider.

  **Implementation plan for Step 5.4:**
  - Add a storage module, likely `electron-app/src/main/storage/wrapperEvents.ts`, over the existing `wrapper_events` table from `electron-app/src/main/storage/migrations.ts`.
  - Implement append/start/finish/query helpers with provider and time-window filters, provider/invocation uniqueness, duration derivation, bounded reads for UI/provider adapters, and privacy-safe diagnostics summaries.
  - Add wrapper event parsing helpers that accept only derived wrapper metadata and stderr limit signals. Do not persist prompts, stdout, raw stderr, provider tokens, session keys, GitHub tokens, OAuth credentials, API keys, cookies, or raw chat/session bodies.
  - Add enough fixture coverage for duplicate invocation IDs, malformed wrapper payloads, missing finish records, nonzero exit codes, and limit-hit classification.
  - Validate with focused storage/wrapper event tests and `npm run typecheck` from `electron-app/`.

  **Result for Step 5.4:**
  - Added `electron-app/src/main/storage/wrapperEvents.ts` over the existing `wrapper_events` table with start/finish recording, provider/invocation uniqueness, duration derivation, exit-status and limit-hit updates, provider/time filtered recent-event reads, and privacy-safe provider summaries.
  - Added `electron-app/src/main/wrappers/stderrScanner.ts` for stderr-only Codex/Gemini limit, quota, cooldown, reset, and lockout detection. The scanner ignores stdout and redacts diagnostic text before returning it.
  - Exported the wrapper event store through `electron-app/src/main/storage/index.ts`.
  - Focused validation passed: `npm test -- --run src/foundation-storage.test.ts src/main/wrappers/events.test.ts src/main/wrappers/stderrScanner.test.ts` and `npm run typecheck` from `electron-app/`. Accepted warning: Node's experimental SQLite warning during storage tests.
  - Full Phase 5 test/build remain intentionally deferred because Step 5.5 provider confidence wiring and Step 5.6 Accuracy Mode UI red suites are still assigned to later steps.

- [x] Step 5.5: [automated] Merge wrapper events into Codex/Gemini confidence engines and provider cards without weakening passive-only support.

  **Implementation plan for Step 5.5:**
  - Extend Codex and Gemini adapters to accept recent wrapper event summaries from the ledger alongside the existing passive adapter snapshots.
  - For Codex, use wrapper events to improve activity/limit-hit/reset evidence but keep `exact` unavailable without a future defensible provider source. Wrapper-derived Codex confidence should top out at `high_confidence` when repeated limit/reset patterns and configured plan/profile justify it.
  - For Gemini, merge wrapper events with auth/profile and `/stats` data. Wrapper-counted requests against a known published quota profile may improve confidence, but provider cards must clearly distinguish wrapper-derived estimates from provider-supplied exact current usage.
  - Preserve passive fallback when wrappers are disabled, missing, stale, degraded, or unverifiable. Existing passive cards should remain useful and confidence-labeled.
  - Update diagnostics export placeholders to include wrapper status and derived event summaries only, with redaction tests for unsafe terms.
  - Validate with focused Codex/Gemini adapter, confidence, diagnostics, and IPC tests, then `npm run typecheck` from `electron-app/`.

  **Result for Step 5.5:**
  - Extended the Codex and Gemini Electron adapters with verified wrapper event readers that merge app-owned wrapper invocation evidence into provider cards without coupling the adapters to raw SQLite records.
  - Codex wrapper events now upgrade the card to Accuracy Mode and `high_confidence` while still preventing any `exact` quota claim. Passive-only Codex fallback remains estimated.
  - Gemini wrapper events now merge with passive session counts and profile headroom, keep `/stats` as the provider-supplied accuracy source, and switch verified wrapper-backed cards to Accuracy Mode with Accuracy Mode confidence copy.
  - Diagnostics export entries now include passive versus Accuracy Mode status while preserving derived-status-only redaction.
  - Focused validation passed: `npm test -- --run src/main/providers/codex/adapter.test.ts src/main/providers/gemini/adapter.test.ts src/shared/confidence/providerConfidence.test.ts src/main/ipc.test.ts` and `npm run typecheck` from `electron-app/`. Full Phase 5 test/build remain intentionally deferred because Step 5.6 Accuracy Mode UI red suites are still assigned to the next step.

- [x] Step 5.6: [automated] Add Accuracy Mode UI in settings/onboarding: opt-in toggles, setup commands, verification status, privacy copy, troubleshooting, and removal instructions.

  **Implementation plan for Step 5.6:**
  - Extend provider settings types/defaults/schemas to persist Accuracy Mode enablement separately from passive provider enablement and any future Provider Telemetry settings.
  - Update `electron-app/src/renderer/settings/` and `electron-app/src/renderer/onboarding/` to show Codex/Gemini Accuracy Mode opt-in toggles, generated setup commands, verification status, troubleshooting copy, and removal instructions.
  - Keep copy explicit: wrappers are optional, reversible, manually installed, and capture invocation timing/derived limit signals only. Do not claim the app edits shell profiles automatically.
  - Ensure renderer state remains secret-free and prompt-free. Settings may show commands/instructions but not raw provider auth, stdout, stderr, prompts, responses, or session contents.
  - Validate with focused renderer/settings/onboarding tests, then `npm run typecheck` from `electron-app/`.

  **Result for Step 5.6:**
  - Added provider settings persistence for `accuracyModeEnabled`, separate from passive provider enablement and adapter mode.
  - Added Codex/Gemini Accuracy Mode controls in settings: opt-in toggles, generated setup commands and instructions, verification status, troubleshooting guidance, removal instructions, and manual/no-shell-mutation privacy copy.
  - Added onboarding copy that keeps Accuracy Mode optional, manually configured, and clear that shell profiles are not edited and prompts/stdout are not stored.
  - Tightened settings copy so the renderer privacy assertion sees no prompt/stdout/raw-stderr/token/cookie/session-key terms in wrapper setup state.
  - Focused validation passed: `npm test -- --run src/foundation-renderer.test.tsx`, `npm test -- --run src/foundation-renderer.test.tsx src/foundation-schemas.test.ts src/shared/schemas/provider.test.ts`, and `npm run typecheck` from `electron-app/`.

## Green
- [ ] Step 5.7: [automated] Make all Phase 5 tests pass and add integration coverage for wrapper setup flows, ledger trimming, confidence upgrades, and redacted diagnostics.

  **Implementation plan for Step 5.7:**
  - Run focused Phase 5 suites first: wrappers, wrapper storage, IPC/preload schemas, Codex/Gemini adapter confidence, diagnostics, settings, onboarding, and renderer smoke coverage.
  - Fix missing integration edges, then add regressions for wrapper setup instructions, wrapper version mismatch, ledger trimming/bounded reads, confidence upgrades/downgrades, disabled-wrapper fallback, Accuracy Mode disabled/enabled UI states, and diagnostics redaction.
  - Confirm `accuracyModeEnabled` is honored without weakening passive-only support: disabled or unverifiable wrappers must leave provider cards useful and confidence-labeled rather than forcing Accuracy Mode.
  - Run `npm run typecheck` and `npm test -- --run` from `electron-app/`. Accepted warning remains Node's experimental SQLite warning during storage/integration tests if no new warnings appear.

- [ ] Step 5.8: [automated] Run Phase 5 verification: `npm run typecheck`, `npm test`, `npm run build`, and wrapper setup renderer smoke tests.

  **Implementation plan for Step 5.8:**
  - Run `npm run typecheck`, `npm test -- --run`, `npm run build`, and `npm run smoke:electron` from `electron-app/`.
  - Confirm wrapper setup renderer smoke coverage includes Codex and Gemini Accuracy Mode disabled, setup-generated, verified, unverifiable, and removal-instruction states.
  - Inspect all warnings. Accept only the known Node experimental SQLite warning if it appears during storage/integration tests; fix or report any new Electron startup/preload/security, wrapper process, renderer, or diagnostics warnings.
  - If verification passes, archive Phase 5 into `tasks/phases/`, check off the Phase 5 milestone in `tasks/roadmap.md`, advance `tasks/todo.md` to Phase 6, and extract Phase 6 manual tasks into `tasks/manual-todo.md`.

## Milestone
- [ ] Accuracy Mode is explicit, opt-in, verifiable, and reversible.
- [ ] Wrappers persist only derived metadata and never raw prompts, stdout, session keys, GitHub tokens, or provider auth tokens.
- [ ] Wrapper events improve confidence where justified.
- [ ] All phase tests pass.
- [ ] No regressions.
