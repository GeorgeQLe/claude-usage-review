# Electron Cross-Platform AI Usage Monitor — Phase Plan

Build `electron-app/` as the full Windows/Linux implementation of ClaudeUsage while keeping the Swift app as the premium canonical macOS menu-bar product. The Electron path should port the complete product behavior from the Swift implementation where cross-platform APIs allow it: Claude exact usage, history, pace, GitHub heatmap, overlay, notifications, provider rotation, Codex/Gemini monitoring, Accuracy Mode wrappers, migration, diagnostics, and packaged Windows/Linux artifacts.

| Phase | Focus | Outcome |
| --- | --- | --- |
| 1 | Electron runtime foundation | Complete: secure Electron/React app shell with typed IPC, storage skeleton, tray/windows, and baseline UI |
| 2 | Claude exact usage and accounts | Claude account workflows, exact API polling, backoff, reset fetch, secret storage, and live tray/popover state |
| 3 | Product UI parity | Pace, history, GitHub heatmap, overlay, notifications, and polished settings/onboarding |
| 4 | Provider shell and passive adapters | Shared provider model plus Codex/Gemini passive monitoring, Gemini `/stats`, confidence, stale/degraded handling |
| 5 | Accuracy Mode wrappers | Explicit opt-in Codex/Gemini wrappers, setup verification, event ledgers, and privacy guarantees |
| 6 | Migration, diagnostics, packaging | Non-secret migration, diagnostics export, Windows/Linux packages, and final regression gates |

## Phase 1: Electron Runtime Foundation
> Test strategy: tests-after
> Status: complete on 2026-04-15

### Implementation
- [x] Step 1.1: [automated] Scaffold `electron-app/` with Electron, React, TypeScript, Vite, Electron Builder, Vitest, and project scripts in `electron-app/package.json`, `electron-app/vite.config.ts`, `electron-app/electron-builder.yml`, `electron-app/tsconfig*.json`, and `electron-app/src/`.
- [x] Step 1.2: [automated] Add the initial folder/module structure from the spec: `electron-app/src/main/`, `electron-app/src/preload/`, `electron-app/src/renderer/`, and `electron-app/src/shared/`, including shared type/schema placeholders for accounts, usage state, provider cards, settings, and IPC payloads.
- [x] Step 1.3: [automated] Implement the secure Electron main-process bootstrap in `electron-app/src/main/app.ts`, `electron-app/src/main/windows.ts`, and `electron-app/src/main/tray.ts`: single-instance lock, app lifecycle, tray creation, context menu skeleton, popover/settings/overlay/onboarding windows, CSP-ready local loading, and Linux tray fallback handling.
- [x] Step 1.4: [automated] Add a narrow preload bridge in `electron-app/src/preload/index.ts` and `electron-app/src/preload/api.ts` using `contextBridge`, with Node integration disabled and context isolation/sandbox options set on all renderer windows.
- [x] Step 1.5: [automated] Add IPC registration and validation skeletons in `electron-app/src/main/ipc.ts` plus shared schemas under `electron-app/src/shared/schemas/` for the commands listed in the spec.
- [x] Step 1.6: [automated] Add storage primitives in `electron-app/src/main/storage/`: SQLite connection/migrations for structured app data, `safeStorage` secret wrapper, redaction helpers, and a Linux `basic_text` backend warning surfaced through derived app state.
- [x] Step 1.7: [automated] Add minimal React renderer entries for popover, settings, onboarding, and overlay under `electron-app/src/renderer/`, with placeholder state loaded through the preload API and no direct filesystem or Node access.

### Green
- [x] Step 1.8: [automated] Add regression coverage for the foundation: Vitest tests for schema validation/redaction/storage wrappers where possible, an Electron main-process smoke test for window/tray action routing, and a renderer smoke test proving placeholder windows mount without secret/Node access.
- [x] Step 1.9: [automated] Run Phase 1 verification: `npm run typecheck`, `npm test`, `npm run build`, and an Electron dev launch smoke command from `electron-app/`.

### Milestone
- [x] `electron-app/` exists and starts locally.
- [x] Main/preload/renderer boundaries are in place and secure by default.
- [x] Renderer windows mount through React and only use the typed preload API.
- [x] SQLite and secret-storage abstractions exist, with Linux weak-backend warning plumbing.
- [x] Tray, popover, settings, onboarding, and overlay window shells exist.
- [x] All phase tests pass.
- [x] No regressions.

## Phase 2: Claude Exact Usage and Accounts
> Test strategy: tdd

### Tests First
- Step 2.1: [automated] Add failing tests for Claude API parsing, `Set-Cookie` session-key rotation, account metadata CRUD, secret write/read/delete, polling backoff, reset-time fetch scheduling, auth-expired handling, and typed IPC command validation under `electron-app/src/main/**/__tests__/` and `electron-app/src/shared/**/__tests__/`.

### Implementation
- Step 2.2: [automated] Implement account metadata and active-account persistence in `electron-app/src/main/storage/accounts.ts`, with session keys stored only through the secret store and never serialized to renderer state.
- Step 2.3: [automated] Implement the Claude usage client in `electron-app/src/main/services/claudeUsage.ts`, matching the Swift/Tauri API behavior: `sessionKey` cookie, `anthropic-client-platform: web_claude_ai`, all known usage limit fields, 401/403 auth expiry, and session-key rotation.
- Step 2.4: [automated] Implement polling and scheduling in `electron-app/src/main/services/polling.ts`: 5-minute default cadence, exponential network backoff, manual refresh, reset-time fetch, cancellation on account switch, and event emission to renderers.
- Step 2.5: [automated] Wire account and Claude commands through `electron-app/src/main/ipc.ts` and `electron-app/src/preload/api.ts`, including add/rename/remove/switch account, save credentials, test connection, get usage state, refresh now, and subscribe to usage updates.
- Step 2.6: [automated] Implement Claude-aware tray/popover/settings/onboarding UI in `electron-app/src/renderer/`, including write-only credential fields, account picker, auth status, exact usage bars, refresh actions, and basic error states.
- Step 2.7: [automated] Persist Claude usage snapshots in SQLite through `electron-app/src/main/storage/history.ts`, but keep advanced history visualization for Phase 3.

### Green
- Step 2.8: [automated] Make all Phase 2 tests pass and add integration coverage proving renderer state omits secrets while main-process state can fetch/update Claude usage.
- Step 2.9: [automated] Run Phase 2 verification: `npm run typecheck`, `npm test`, `npm run build`, and an Electron smoke launch using mocked Claude responses.

### Milestone
- Claude exact usage works end-to-end in Electron with account management and secure secrets.
- Auth expiry, network errors, manual refresh, backoff, reset fetch, and session-key rotation are covered.
- Renderer never receives session keys.
- Tray and popover show live Claude state.
- All phase tests pass.
- No regressions.

## Phase 3: Product UI Parity
> Test strategy: tests-after

### Implementation
- Step 3.1: [automated] Port Swift pace semantics into shared pure functions under `electron-app/src/shared/formatting/pace.ts`: session/weekly pace windows, unknown guards, behind/way-behind/warning/critical/limit-hit status, daily budget, today usage baseline, and time display formatting.
- Step 3.2: [automated] Expand history storage and visualization with `electron-app/src/main/storage/history.ts` and renderer components under `electron-app/src/renderer/components/`: 24-hour snapshots, 24h-to-7d hourly compaction, session/weekly sparklines, and last-updated text.
- Step 3.3: [automated] Implement GitHub contribution heatmap support in `electron-app/src/main/services/github.ts`, secret GitHub token storage, settings controls, hourly refresh behavior, GraphQL variables, and renderer heatmap components.
- Step 3.4: [automated] Implement the complete settings/onboarding experience in `electron-app/src/renderer/settings/` and `electron-app/src/renderer/onboarding/`: time display, pace theme, weekly color mode, launch at login, provider enablement placeholders, migration prompt placeholders, and notification preferences.
- Step 3.5: [automated] Implement overlay behavior in `electron-app/src/main/windows.ts` and `electron-app/src/renderer/overlay/`: compact/minimal/sidebar layouts, always-on-top behavior, opacity, drag-to-move, position persistence, double-click popover, and context hide/disable action.
- Step 3.6: [automated] Implement local notifications in `electron-app/src/main/services/notifications.ts`: session reset, auth expired, provider degraded placeholder, and user-configurable threshold warnings.
- Step 3.7: [automated] Polish tray/menu behavior in `electron-app/src/main/tray.ts`: exact Claude countdown/reset text, color/icon state, context menu actions, and launch-at-login handling.

### Green
- Step 3.8: [automated] Add regression tests for pace functions, history compaction, GitHub GraphQL request construction, overlay settings persistence, notification preferences, and renderer component state.
- Step 3.9: [automated] Add Electron/Playwright smoke coverage for settings, onboarding, popover, overlay layouts, error states, and GitHub disabled/configured states.
- Step 3.10: [automated] Run Phase 3 verification: `npm run typecheck`, `npm test`, `npm run build`, and renderer smoke tests.

### Milestone
- Electron matches the Swift product's non-provider Claude UI behavior where cross-platform APIs allow it.
- Pace, countdown, history, heatmap, overlay, notifications, and settings work without exposing secrets.
- All phase tests pass.
- No regressions.

## Phase 4: Provider Shell and Passive Adapters
> Test strategy: tdd

### Tests First
- Step 4.1: [automated] Add failing tests for shared provider normalization, tray rotation/manual override/pinning, stale/degraded card mapping, Codex detection and parsing, Codex bookmarks, Gemini detection and parsing, Gemini `/stats` summary parsing, confidence engines, and provider settings persistence.

### Implementation
- Step 4.2: [automated] Implement shared provider models and coordinator logic under `electron-app/src/shared/types/provider.ts`, `electron-app/src/shared/confidence/`, and `electron-app/src/main/providers/providerCoordinator.ts`.
- Step 4.3: [automated] Implement Codex passive adapter under `electron-app/src/main/providers/codex/`: `CODEX_HOME` resolution, install/auth presence detection, `history.jsonl` incremental bookmarks, recursive `sessions/YYYY/MM/DD/rollout-*.jsonl` parsing, local log limit-hit detection, cooldown state, and privacy-safe derived events.
- Step 4.4: [automated] Implement Gemini passive adapter under `electron-app/src/main/providers/gemini/`: `GEMINI_HOME`/`~/.gemini` resolution, settings/auth-mode detection, `oauth_creds.json` presence, `tmp/**/chats/session-*.json` parsing, token/model extraction, rate pressure, and local request windows.
- Step 4.5: [automated] Implement Gemini `/stats` support under `electron-app/src/main/providers/gemini/stats.ts`, using a deliberate helper path and confidence labeling based on the reliability of command-derived summaries.
- Step 4.6: [automated] Implement provider settings UI and IPC for Codex/Gemini enablement, plan/auth confirmation, confidence explanations, last refresh, stale/degraded diagnostics, and provider refresh actions.
- Step 4.7: [automated] Wire provider state into tray rotation, popover provider cards, settings provider rows, overlay summaries, and diagnostics placeholders.

### Green
- Step 4.8: [automated] Make all Phase 4 tests pass and add fixture coverage for malformed provider files, missing CLIs, unknown auth modes, stale refresh timestamps, degraded adapters, and confidence downgrade paths.
- Step 4.9: [automated] Run Phase 4 verification: `npm run typecheck`, `npm test`, `npm run build`, and provider-card renderer smoke tests.

### Milestone
- Claude, Codex, and Gemini are first-class provider cards in Electron.
- Codex and Gemini passive monitoring is useful, confidence-labeled, stale-aware, and degraded-aware.
- Gemini can incorporate `/stats` summaries where available.
- Codex never claims exact remaining quota without a defensible source.
- All phase tests pass.
- No regressions.

## Phase 5: Accuracy Mode Wrappers
> Test strategy: tdd

### Tests First
- Step 5.1: [automated] Add failing tests for wrapper script generation, setup-command rendering, setup verification, wrapper event ledgers, stderr limit-hit scanning, confidence upgrades from wrapper events, and privacy constraints proving no prompts/stdout/secrets are persisted.

### Implementation
- Step 5.2: [automated] Implement wrapper generation under `electron-app/src/main/wrappers/`: per-provider wrapper scripts/binaries in the app user data directory, versioning, safe removal instructions, and no automatic shell/PATH mutation.
- Step 5.3: [automated] Implement setup verification for Codex and Gemini wrappers: resolve command paths, detect whether `codex`/`gemini` points at the wrapper, run harmless version/status probes where safe, and report status through IPC.
- Step 5.4: [automated] Implement wrapper event ledgers in SQLite for Codex and Gemini: invocation ID, start/end, duration, command mode, model, exit status, limit-hit flag, wrapper version, and source provider.
- Step 5.5: [automated] Merge wrapper events into Codex/Gemini confidence engines and provider cards without weakening passive-only support.
- Step 5.6: [automated] Add Accuracy Mode UI in settings/onboarding: opt-in toggles, setup commands, verification status, privacy copy, troubleshooting, and removal instructions.

### Green
- Step 5.7: [automated] Make all Phase 5 tests pass and add integration coverage for wrapper setup flows, ledger trimming, confidence upgrades, and redacted diagnostics.
- Step 5.8: [automated] Run Phase 5 verification: `npm run typecheck`, `npm test`, `npm run build`, and wrapper setup renderer smoke tests.

**Manual Tasks:**
- [ ] Validate generated Codex wrapper setup instructions in a real user shell without allowing the app to edit shell profiles automatically. _(after: Step 5.6)_
- [ ] Validate generated Gemini wrapper setup instructions in a real user shell without allowing the app to edit shell profiles automatically. _(after: Step 5.6)_

### Milestone
- Accuracy Mode is explicit, opt-in, verifiable, and reversible.
- Wrappers persist only derived metadata and never raw prompts, stdout, session keys, GitHub tokens, or provider auth tokens.
- Wrapper events improve confidence where justified.
- All phase tests pass.
- No regressions.

## Phase 6: Migration, Diagnostics, and Packaging
> Test strategy: tests-after

### Implementation
- Step 6.1: [automated] Implement non-secret migration from Swift and Tauri sources under `electron-app/src/main/migration/`: account labels, org IDs, active account, display settings, provider settings, overlay settings, compatible history snapshots, and migration records.
- Step 6.2: [automated] Implement migration UI in onboarding/settings that clearly reports imported metadata and prompts users to re-enter Claude session keys, GitHub tokens, and any future provider secrets.
- Step 6.3: [automated] Implement diagnostics view/export under `electron-app/src/main/diagnostics/` and `electron-app/src/renderer/settings/`: platform, app version, storage backend, provider detection, refresh times, failure counts, parse bookmarks, wrapper status, and redacted recent logs.
- Step 6.4: [automated] Configure Electron Builder targets for Windows NSIS, Windows portable, Linux AppImage, Linux `deb`, and optional unsigned macOS dev/parity builds in `electron-app/electron-builder.yml`.
- Step 6.5: [automated] Add packaging scripts and documentation in `electron-app/package.json`, `electron-app/README.md`, and root docs as needed, explicitly stating Swift remains the public premium macOS app and Electron is the Windows/Linux path.
- Step 6.6: [automated] Add final regression gates for package creation, migration fixtures, diagnostics redaction, storage backend warnings, and renderer smoke flows.

### Green
- Step 6.7: [automated] Run full Electron verification: `npm run typecheck`, `npm test`, `npm run build`, Electron smoke tests, and available package builds for the current host.
- Step 6.8: [automated] Update `tasks/history.md`, `README.md`, and `docs/cross-platform-parity.md` to reflect the Electron plan/status once implementation reaches this gate.

**Manual Tasks:**
- [ ] Run a live Claude credential smoke test with a real session key and org ID, then confirm the Electron app stores secrets only through the secret store and does not render them back in Settings. _(after: Step 6.7)_
- [ ] Validate the Windows NSIS installer and portable build on a real Windows machine, including tray behavior, launch at login, notifications, and packaged app startup. _(after: Step 6.7)_
- [ ] Validate the Linux AppImage and `deb` package on the selected target desktop environments, including tray fallback behavior, notifications, `safeStorage` backend warning, and packaged app startup. _(after: Step 6.7)_

### Milestone
- Non-secret migration works and secret re-entry is clear.
- Diagnostics export is useful and redacted.
- Windows/Linux packaging config exists and host-available package builds pass.
- Documentation states the Swift/Electron platform split accurately.
- All phase tests pass.
- No regressions.

## Cross-Phase Concerns

- Security: keep Node integration disabled, context isolation enabled, IPC schemas validated, CSP strict, and renderer state secret-free in every phase.
- Privacy: persist only derived provider telemetry; never persist raw prompts, CLI stdout, session keys, GitHub tokens, or provider auth tokens outside secret storage.
- Accessibility: ensure tray alternatives, keyboard navigation, readable contrast, and settings/onboarding forms are usable without mouse-only flows.
- Performance: avoid expensive recursive provider scans without bookmarks; keep polling local and incremental; index SQLite tables used for history/provider windows.
- Cross-platform behavior: test Windows/Linux path differences for tray, notifications, launch at login, `safeStorage`, filesystem paths, and wrapper setup instructions.
- Compatibility: Swift remains the premium macOS app; Electron macOS builds are development/parity artifacts unless a later decision changes public distribution.
