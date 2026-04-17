# Phase 4: Provider Shell and Passive Adapters

> Project: ClaudeUsage Electron cross-platform app
> Source: `tasks/roadmap.md`
> Scope: Add the shared provider shell plus Codex/Gemini passive monitoring, Gemini `/stats`, confidence labels, stale/degraded handling, and provider settings wiring.
> Test strategy: tdd

## Tests First
- [x] Step 4.1: [automated] Add failing tests for shared provider normalization, tray rotation/manual override/pinning, stale/degraded card mapping, Codex detection and parsing, Codex bookmarks, Gemini detection and parsing, Gemini `/stats` summary parsing, confidence engines, and provider settings persistence.

  **Implementation plan for Step 4.1:**
  - Add shared provider-shell tests first. Cover normalized provider cards, provider-specific confidence explanations, stale/degraded state mapping, tray rotation order, degraded-provider skipping when alternatives exist, manual override behavior, pinning behavior, and clear fallback text for missing/low-confidence providers. Expected files: `electron-app/src/main/providers/providerCoordinator.test.ts`, `electron-app/src/shared/confidence/providerConfidence.test.ts`, and focused additions to `electron-app/src/foundation-main.test.ts` or `electron-app/src/main/tray.test.ts` if a dedicated tray test file exists by then.
  - Add Codex passive adapter red tests using temporary fixture directories only. Cover `CODEX_HOME` fallback to `~/.codex`, install/auth presence detection from `config.toml` and `auth.json` without reading token values, `history.jsonl` incremental byte-offset bookmarks, recursive `sessions/YYYY/MM/DD/rollout-*.jsonl` parsing, malformed JSONL tolerance, local limit/cooldown text detection, stale/degraded transitions, and privacy assertions that prompt text, auth tokens, cookies, and raw session contents are not emitted or persisted. Expected files: `electron-app/src/main/providers/codex/detector.test.ts`, `electron-app/src/main/providers/codex/history.test.ts`, `electron-app/src/main/providers/codex/sessions.test.ts`, `electron-app/src/main/providers/codex/adapter.test.ts`.
  - Add Gemini passive adapter red tests using temporary fixture directories only. Cover `GEMINI_HOME` fallback to `~/.gemini`, `settings.json` auth-mode detection, `oauth_creds.json` presence without token extraction, `tmp/**/chats/session-*.json` request/timestamp/token/model parsing, malformed session files, request-per-minute and daily request windows, stale/degraded transitions, and privacy assertions that prompts, OAuth tokens, API keys, and raw chat bodies are not emitted or persisted. Expected files: `electron-app/src/main/providers/gemini/detector.test.ts`, `electron-app/src/main/providers/gemini/sessions.test.ts`, `electron-app/src/main/providers/gemini/adapter.test.ts`.
  - Add Gemini `/stats` red tests around a deliberate helper boundary rather than running the real CLI. Cover summary parsing, unsupported/missing command output, confidence upgrade when the summary is reliable, and diagnostics text that remains redacted. Expected file: `electron-app/src/main/providers/gemini/stats.test.ts`.
  - Add settings/IPC red tests for provider enablement, plan/auth/profile persistence, provider refresh actions, diagnostics responses, and renderer state that exposes only derived provider status. Expected files: `electron-app/src/shared/schemas/provider.test.ts`, `electron-app/src/main/ipc.test.ts`, `electron-app/src/foundation-renderer.test.tsx`.
  - Keep these tests red for missing production modules and behaviors. Run focused tests to confirm the red state, then run `npm run typecheck` if the red tests are written in a way that should still typecheck through intentional runtime failures. Do not implement provider modules in this step.

## Implementation
- [x] Step 4.2: [automated] Implement shared provider models and coordinator logic under `electron-app/src/shared/types/provider.ts`, `electron-app/src/shared/schemas/provider.ts`, `electron-app/src/shared/confidence/`, and `electron-app/src/main/providers/providerCoordinator.ts`.

  **Implementation plan for Step 4.2:**
  - Extend provider settings beyond placeholders to include enablement, plan/profile, auth mode, adapter mode, manual tray override, pinning, and stale thresholds while keeping current defaults backward-compatible.
  - Add provider confidence helpers with plain-language explanations and hard guards that keep Codex/Gemini from claiming exact confidence without a future exact source.
  - Add a coordinator that merges Claude, Codex, and Gemini provider snapshots into `UsageState`, derives stale/degraded/missing cards, orders tray rotation candidates, skips degraded providers when healthy alternatives exist, and preserves manual override/pin state.
  - Keep Claude exact usage behavior unchanged and avoid moving Claude credentials or polling into the new provider shell.
  - Start from the Step 4.1 red suites now present in `electron-app/src/main/providers/providerCoordinator.test.ts`, `electron-app/src/shared/confidence/providerConfidence.test.ts`, `electron-app/src/shared/schemas/provider.test.ts`, `electron-app/src/main/ipc.test.ts`, and `electron-app/src/foundation-renderer.test.tsx`. For Step 4.2, make only the shared model/coordinator/confidence/settings-schema portion green; Codex/Gemini adapter tests under `electron-app/src/main/providers/{codex,gemini}/` should remain red until Steps 4.3-4.5.

- [x] Step 4.3: [automated] Implement Codex passive adapter under `electron-app/src/main/providers/codex/`: `CODEX_HOME` resolution, install/auth presence detection, `history.jsonl` incremental bookmarks, recursive `sessions/YYYY/MM/DD/rollout-*.jsonl` parsing, local log limit-hit detection, cooldown state, and privacy-safe derived events.

  **Implementation plan for Step 4.3:**
  - Start from the red suites in `electron-app/src/main/providers/codex/detector.test.ts`, `electron-app/src/main/providers/codex/history.test.ts`, `electron-app/src/main/providers/codex/sessions.test.ts`, and `electron-app/src/main/providers/codex/adapter.test.ts`. Keep Gemini tests out of scope for this step.
  - Create Codex modules under `electron-app/src/main/providers/codex/`: home resolution/detection, `config.toml`/`auth.json` presence parsing, `history.jsonl` parsing, recursive `sessions/YYYY/MM/DD/rollout-*.jsonl` parsing, bookmark persistence, adapter snapshot assembly, and small fixture builders if needed by tests.
  - Resolve `CODEX_HOME` first, then fall back to `~/.codex`. Treat install/auth as presence and safe account labels only; never emit raw auth JSON, tokens, cookies, prompts, stdout, or raw session payloads.
  - Persist only derived parse bookmarks and sanitized event summaries needed for confidence and stale/degraded state. Bookmarks should be byte-offset based for `history.jsonl` and resilient to truncation or malformed JSONL.
  - Return provider cards compatible with the Step 4.2 coordinator/settings contracts: passive adapter mode, no exact quota confidence, useful degraded/stale detail text, and privacy-safe diagnostics.
  - Validate with focused Codex provider tests first, then `npm run typecheck` from `electron-app/`. Full Phase 4 tests may still fail on Gemini adapter and `/stats` work until Steps 4.4-4.5.

- [x] Step 4.4: [automated] Implement Gemini passive adapter under `electron-app/src/main/providers/gemini/`: `GEMINI_HOME`/`~/.gemini` resolution, settings/auth-mode detection, `oauth_creds.json` presence, `tmp/**/chats/session-*.json` parsing, token/model extraction, rate pressure, and local request windows.

  **Implementation plan for Step 4.4:**
  - Start from the red suites in `electron-app/src/main/providers/gemini/detector.test.ts`, `electron-app/src/main/providers/gemini/sessions.test.ts`, and `electron-app/src/main/providers/gemini/adapter.test.ts`. Keep Gemini `/stats` tests out of scope until Step 4.5 unless a shared helper is unavoidable.
  - Create Gemini modules under `electron-app/src/main/providers/gemini/`: home resolution/detection, settings/auth-mode parsing, OAuth/API credential presence detection, chat session tree parsing, adapter snapshot assembly, and small parser helpers if needed by tests.
  - Resolve `GEMINI_HOME` first, then fall back to `~/.gemini`. Treat `settings.json` and `oauth_creds.json` as presence/auth-mode signals only; never emit or persist OAuth tokens, API keys, prompts, responses, or raw chat bodies.
  - Parse `tmp/**/chats/session-*.json` into privacy-safe derived events: timestamp, model, token totals where available, request counts, and malformed-file diagnostics. Drop raw request/response content before it reaches provider snapshots or diagnostics.
  - Derive local request-per-minute and daily request windows from parsed event timestamps. Use provider settings/profile assumptions only for coarse headroom text; do not claim exact remaining quota from passive files.
  - Return provider cards compatible with the Step 4.2 coordinator/settings contracts: passive adapter mode, estimated confidence, useful stale/degraded detail text, and privacy-safe diagnostics.
  - Validate with focused Gemini passive adapter tests first, then `npm run typecheck` from `electron-app/`. Full Phase 4 tests may still fail on Gemini `/stats` and later UI/tray wiring until Steps 4.5-4.8.

- [ ] Step 4.5: [automated] Implement Gemini `/stats` support under `electron-app/src/main/providers/gemini/stats.ts`, using a deliberate helper path and confidence labeling based on the reliability of command-derived summaries.

  **Implementation plan for Step 4.5:**
  - Start from the red suite in `electron-app/src/main/providers/gemini/stats.test.ts`. Keep settings UI, IPC, tray, popover, overlay, and diagnostics export wiring out of scope until Steps 4.6-4.7.
  - Create `electron-app/src/main/providers/gemini/stats.ts` with a pure parser for known Gemini `/stats` summary shapes: requests today, daily limit, tokens today, model, reset timestamp, reliable-summary confidence, unsupported/missing command diagnostics, and redaction of OAuth/API key/token text.
  - Add a deliberate helper boundary for future command execution, but do not invoke the real Gemini CLI in tests. Any command runner should be injectable/fakeable and should not run interactive commands as part of Step 4.5 validation.
  - Merge reliable `/stats` summaries into `electron-app/src/main/providers/gemini/adapter.ts` only if needed to satisfy the red tests or keep the integration boundary coherent. Preserve the passive adapter fallback from Step 4.4: local chat sessions still work when `/stats` is unavailable or unsupported.
  - Keep confidence labeling conservative: `/stats` can raise Gemini to `high_confidence` for parsed command-derived summaries, but passive-only local files must remain `estimated` or `observed_only` and must not claim exact remaining quota.
  - Validate with `npm test -- --run src/main/providers/gemini/stats.test.ts src/main/providers/gemini/adapter.test.ts` and `npm run typecheck` from `electron-app/`. Full Phase 4 tests may still fail on settings/UI/tray wiring until Steps 4.6-4.8.

- [ ] Step 4.6: [automated] Implement provider settings UI and IPC for Codex/Gemini enablement, plan/auth confirmation, confidence explanations, last refresh, stale/degraded diagnostics, and provider refresh actions.

  **Implementation plan for Step 4.6:**
  - Extend `electron-app/src/shared/types/settings.ts`, `electron-app/src/shared/schemas/settings.ts`, `electron-app/src/shared/settings/defaults.ts`, `electron-app/src/main/ipc.ts`, and `electron-app/src/preload/api.ts` for provider settings and refresh/diagnostics actions.
  - Update `electron-app/src/renderer/settings/` and onboarding provider setup to show Codex/Gemini enablement, plan/auth/profile confirmation, confidence explanations, last refresh, stale/degraded diagnostics, and provider refresh actions.
  - Keep provider secrets write-only or presence-only. Do not add live Codex, ChatGPT, Gemini, Google, or Vertex network calls.

- [ ] Step 4.7: [automated] Wire provider state into tray rotation, popover provider cards, settings provider rows, overlay summaries, and diagnostics placeholders.

  **Implementation plan for Step 4.7:**
  - Update `electron-app/src/main/tray.ts` to use coordinator-derived rotation, manual override, pinning, provider-specific compact text, and stale/degraded/missing icon states.
  - Replace placeholder Codex/Gemini cards in `electron-app/src/renderer/components/` and `electron-app/src/renderer/overlay/` with provider-specific card summaries that do not force Claude-only bar semantics onto passive providers.
  - Add diagnostics export placeholders for provider detection, parse bookmarks, stale/degraded reasons, and confidence explanations, with redaction checks.

## Green
- [ ] Step 4.8: [automated] Make all Phase 4 tests pass and add fixture coverage for malformed provider files, missing CLIs, unknown auth modes, stale refresh timestamps, degraded adapters, and confidence downgrade paths.

  **Implementation plan for Step 4.8:**
  - Run the focused Phase 4 suites first, fix implementation gaps, then run `npm run typecheck` and `npm test -- --run` from `electron-app/`.
  - Add any missing regression fixtures discovered while making tests pass, especially malformed JSONL/session files and redaction edge cases.
  - Accepted warning remains Node's experimental SQLite warning during storage/integration tests.

- [ ] Step 4.9: [automated] Run Phase 4 verification: `npm run typecheck`, `npm test`, `npm run build`, and provider-card renderer smoke tests.

  **Implementation plan for Step 4.9:**
  - Run `npm run typecheck`, `npm test -- --run`, `npm run build`, and `npm run smoke:electron` from `electron-app/`.
  - Inspect all warnings, especially Electron startup/preload/security warnings and provider-parser warnings.
  - If verification passes, archive Phase 4, update `tasks/roadmap.md`, and prepare Phase 5.

## Milestone
- [ ] Claude, Codex, and Gemini are first-class provider cards in Electron.
- [ ] Codex and Gemini passive monitoring is useful, confidence-labeled, stale-aware, and degraded-aware.
- [ ] Gemini can incorporate `/stats` summaries where available.
- [ ] Codex never claims exact remaining quota without a defensible source.
- [ ] All phase tests pass.
- [ ] No regressions.
