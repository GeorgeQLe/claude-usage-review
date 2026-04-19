# Phase 6: Migration, Diagnostics, and Packaging

> Project: ClaudeUsage Electron cross-platform app
> Source: `tasks/roadmap.md`
> Scope: Non-secret migration, diagnostics export, Windows/Linux packaging, packaging documentation, and final Electron regression gates.
> Test strategy: tests-after
> Status: active as of 2026-04-19

### Execution Profile
**Parallel mode:** serial
**Integration owner:** main agent
**Conflict risk:** high
**Review gates:** correctness, tests, security, privacy, docs/API conformance, UX

**Subagent lanes:** none

## Implementation
- [x] Step 6.1: [automated] Implement non-secret migration from Swift and Tauri sources under `electron-app/src/main/migration/`: account labels, org IDs, active account, display settings, provider settings, overlay settings, compatible history snapshots, and migration records.

  **Implementation plan for Step 6.1:**
  - Create `electron-app/src/main/migration/` with source discovery, parsers, import planning, and import execution modules. Keep filesystem access in the main process only and expose no raw paths or file contents directly to renderers.
  - Add Swift metadata import support for accessible non-secret settings only: account labels, org IDs, active account hints, display settings, provider settings, overlay settings, and compatible history snapshots where structures are known. Do not read or import Keychain values, Claude session keys, GitHub tokens, provider auth tokens, cookies, API keys, or raw provider session/prompt bodies.
  - Add Tauri metadata import support for non-secret `config.json`-style settings and compatible local history snapshots. Treat all secret-like fields as skipped with explicit re-entry reasons.
  - Persist migration attempts in the existing `migration_records` table via a new storage helper, with source, status, imported counts, skipped secret categories, failures, and timestamps.
  - Add focused implementation tests after the import path exists, likely `electron-app/src/main/migration/*.test.ts` and storage coverage in `electron-app/src/foundation-storage.test.ts`, using temporary fixture directories only.
  - Validate with focused migration/storage tests, then `npm run typecheck` from `electron-app/`.

- [ ] Step 6.2: [automated] Implement migration UI in onboarding/settings that clearly reports imported metadata and prompts users to re-enter Claude session keys, GitHub tokens, and any future provider secrets.

  **Implementation plan for Step 6.2:**
  - Add typed IPC/preload contracts for scanning migration candidates, running a selected migration, and reading migration records. Expected files: `electron-app/src/shared/types/ipc.ts`, `electron-app/src/shared/schemas/ipc.ts`, `electron-app/src/main/ipc.ts`, `electron-app/src/preload/api.ts`.
  - Wire runtime dependencies in `electron-app/src/main/app.ts` so migration commands use the new main-process migration service.
  - Update `electron-app/src/renderer/settings/index.tsx` and `electron-app/src/renderer/onboarding/index.tsx` to show candidate source, imported metadata counts, skipped secret categories, failures, and re-entry prompts.
  - Keep secret fields write-only. Renderer state may include "needs re-entry" flags but must not include secret values or raw imported file contents.
  - Validate with focused IPC/schema/renderer tests and `npm run typecheck` from `electron-app/`.

- [ ] Step 6.3: [automated] Implement diagnostics view/export under `electron-app/src/main/diagnostics/` and `electron-app/src/renderer/settings/`: platform, app version, storage backend, provider detection, refresh times, failure counts, parse bookmarks, wrapper status, and redacted recent logs.

  **Implementation plan for Step 6.3:**
  - Create `electron-app/src/main/diagnostics/` for assembling diagnostics exports from app metadata, secret-storage status, settings, provider diagnostics, parse bookmarks, wrapper verification summaries, migration records, and recent diagnostics events.
  - Add or extend storage helpers for bounded diagnostics event reads from `diagnostics_events`, with redaction applied before export.
  - Replace placeholder `exportDiagnostics` behavior in `electron-app/src/main/ipc.ts` with the diagnostics service while preserving schema validation.
  - Update Settings with a diagnostics section that can render a summary and export/copy redacted JSON without exposing session keys, GitHub tokens, provider auth tokens, raw prompts, CLI stdout, cookies, or raw stderr.
  - Validate with focused diagnostics, IPC, schema, and renderer tests, plus `npm run typecheck` from `electron-app/`.

- [ ] Step 6.4: [automated] Configure Electron Builder targets for Windows NSIS, Windows portable, Linux AppImage, Linux `deb`, and optional unsigned macOS dev/parity builds in `electron-app/electron-builder.yml`.

  **Implementation plan for Step 6.4:**
  - Audit the existing `electron-app/electron-builder.yml`; it already declares Windows `nsis`/`portable`, Linux `AppImage`/`deb`, and macOS `dir` targets.
  - Add any missing metadata needed for package correctness: artifact names, app category where relevant, icons/build resources if present, Linux desktop metadata, and explicit unsigned macOS dev/parity behavior.
  - Avoid adding signing, notarization, auto-update, or production publishing unless a later release contract explicitly requests them.
  - Validate with config-focused tests or package dry-run commands available on the current host, plus `npm run typecheck` where applicable.

- [ ] Step 6.5: [automated] Add packaging scripts and documentation in `electron-app/package.json`, `electron-app/README.md`, and root docs as needed, explicitly stating Swift remains the public premium macOS app and Electron is the Windows/Linux path.

  **Implementation plan for Step 6.5:**
  - Extend `electron-app/package.json` scripts only where they improve repeatable local verification, such as host package commands or package dry-runs.
  - Create or update `electron-app/README.md` with development, verification, packaging, privacy, and platform-split notes.
  - Update root `README.md` and `docs/cross-platform-parity.md` so they describe the Electron Windows/Linux path accurately, distinguish it from the older Tauri implementation, and keep Swift as the premium public macOS app.
  - Validate docs and scripts with `npm run typecheck` or the relevant package script dry-run when practical.

- [ ] Step 6.6: [automated] Add final regression gates for package creation, migration fixtures, diagnostics redaction, storage backend warnings, and renderer smoke flows.

  **Implementation plan for Step 6.6:**
  - Add regression tests for Swift/Tauri migration fixtures, skipped-secret reporting, migration records, diagnostics redaction, Linux `basic_text` storage warning presentation, and package config expectations.
  - Extend `electron-app/scripts/smoke-electron.mjs` and renderer smoke fixtures as needed to cover migration summaries and diagnostics/export states.
  - Keep package builds host-aware so macOS verification does not pretend to validate Windows/Linux runtime behavior beyond available builder outputs.
  - Validate with focused regression suites, `npm run typecheck`, and `npm test -- --run` from `electron-app/`.

## Green
- [ ] Step 6.7: [automated] Run full Electron verification: `npm run typecheck`, `npm test`, `npm run build`, Electron smoke tests, and available package builds for the current host.

  **Implementation plan for Step 6.7:**
  - Run `npm run typecheck`, `npm test -- --run`, `npm run build`, and `npm run smoke:electron` from `electron-app/`.
  - Run host-available Electron Builder package commands or dry-runs for the configured targets. Clearly distinguish package config validation from real Windows/Linux machine validation.
  - Inspect all warnings. Accept only known Node experimental SQLite warnings if they appear during storage/integration tests; fix or report any Electron startup/preload/security, migration, diagnostics, package, or renderer warnings.

- [ ] Step 6.8: [automated] Update `tasks/history.md`, `README.md`, and `docs/cross-platform-parity.md` to reflect the Electron plan/status once implementation reaches this gate.

  **Implementation plan for Step 6.8:**
  - Record Phase 6 completion in `tasks/history.md` with validation and package-build details.
  - Update `README.md` and `docs/cross-platform-parity.md` so the project no longer presents Tauri as the current Windows/Linux path when Electron has reached the final gate.
  - Confirm the docs state manual Windows/Linux installer validation remains a human follow-up unless it has been completed on real target machines.
  - If all Phase 6 acceptance criteria are satisfied, archive Phase 6, check off the Phase 6 milestone in `tasks/roadmap.md`, and determine the next roadmap action.

## Milestone
- [ ] Non-secret migration works and secret re-entry is clear.
- [ ] Diagnostics export is useful and redacted.
- [ ] Windows/Linux packaging config exists and host-available package builds pass.
- [ ] Documentation states the Swift/Electron platform split accurately.
- [ ] All phase tests pass.
- [ ] No regressions.

## On Completion
- Deviations from plan: pending.
- Tech debt / follow-ups: pending.
- Ready for next phase: no.
