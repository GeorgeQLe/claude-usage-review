# Phase 2: Claude Exact Usage and Accounts

> Project: ClaudeUsage Electron cross-platform app
> Source: `specs/electron-cross-platform-ai-usage-monitor.md`
> Scope: Replace Phase 1 placeholder Claude/account state with durable account metadata, secret-backed credentials, exact Claude usage fetching, polling, and live renderer/tray state. Preserve the secure Electron boundary: renderer code never receives session keys or direct Node/filesystem access.
> Test strategy: tdd

## Tests First
- [ ] Step 2.1: [automated] Add failing tests for Claude API parsing, `Set-Cookie` session-key rotation, account metadata CRUD, secret write/read/delete, polling backoff, reset-time fetch scheduling, auth-expired handling, and typed IPC command validation under `electron-app/src/main/**/__tests__/` and `electron-app/src/shared/**/__tests__/`.

  **What:** Define the Phase 2 behavior contract before implementation. These tests should fail because the real account store, Claude client, polling scheduler, and durable IPC wiring do not exist yet.

  **Files to create or modify:**
  - `electron-app/src/main/services/claudeUsage.test.ts`: Claude API client contract tests using mocked `fetch` responses. Cover request URL/header/cookie construction, usage JSON parsing for all known limit fields, 401/403 auth expiry, network error classification, malformed responses, and `Set-Cookie` session-key rotation extraction.
  - `electron-app/src/main/storage/accounts.test.ts`: account metadata persistence tests against an in-memory or temp SQLite database. Cover add/rename/remove/switch active account, persisted org IDs, active-account normalization after deletion, and absence of session keys in account summaries.
  - `electron-app/src/main/storage/secrets.test.ts`: extend existing secret-wrapper coverage for Claude credential write/read/delete semantics with an injected safeStorage adapter. Cover encrypted blob persistence and weak-backend status reporting without exposing decrypted values to renderer-facing shapes.
  - `electron-app/src/main/services/polling.test.ts`: polling scheduler contract tests with fake timers and stubbed Claude/account services. Cover 5-minute default cadence, exponential backoff on network errors, reset-time scheduling, manual refresh, cancellation on account switch, and auth-expired stop/degraded behavior.
  - `electron-app/src/main/ipc.test.ts` or focused IPC service tests: cover add/rename/remove/switch account, save credentials, test connection, get usage state, refresh now, and usage-updated events. Ensure payload validation rejects malformed commands and renderer-visible state omits session keys.
  - `electron-app/src/shared/schemas/*.test.ts`: add schema coverage only where Phase 2 introduces new usage/account/auth state fields or stricter response contracts.
  - `electron-app/src/foundation-*.test.ts`: keep existing Phase 1 coverage passing; move or split files only if it makes the Phase 2 tests clearer.

  **Test data and fixtures:**
  - Create minimal Claude usage fixtures inline or under `electron-app/src/main/services/__fixtures__/` if the payloads become large.
  - Include a fixture with `Set-Cookie` containing a rotated `sessionKey`.
  - Include auth-expired and malformed-response fixtures.
  - Use fake timers for polling tests; avoid real network calls and avoid launching Electron.

  **Expected red phase:**
  - The new test files should fail with missing-module or not-implemented assertions for `accounts.ts`, `claudeUsage.ts`, `polling.ts`, and durable IPC integration.
  - Existing Phase 1 tests should still pass unless they are intentionally updated to the new Phase 2 contract.
  - Do not implement production behavior in this step beyond tiny testability seams required to express the failing tests.

## Implementation
- [ ] Step 2.2: [automated] Implement account metadata and active-account persistence in `electron-app/src/main/storage/accounts.ts`, with session keys stored only through the secret store and never serialized to renderer state.
- [ ] Step 2.3: [automated] Implement the Claude usage client in `electron-app/src/main/services/claudeUsage.ts`, matching the Swift/Tauri API behavior: `sessionKey` cookie, `anthropic-client-platform: web_claude_ai`, all known usage limit fields, 401/403 auth expiry, and session-key rotation.
- [ ] Step 2.4: [automated] Implement polling and scheduling in `electron-app/src/main/services/polling.ts`: 5-minute default cadence, exponential network backoff, manual refresh, reset-time fetch, cancellation on account switch, and event emission to renderers.
- [ ] Step 2.5: [automated] Wire account and Claude commands through `electron-app/src/main/ipc.ts` and `electron-app/src/preload/api.ts`, including add/rename/remove/switch account, save credentials, test connection, get usage state, refresh now, and subscribe to usage updates.
- [ ] Step 2.6: [automated] Implement Claude-aware tray/popover/settings/onboarding UI in `electron-app/src/renderer/`, including write-only credential fields, account picker, auth status, exact usage bars, refresh actions, and basic error states.
- [ ] Step 2.7: [automated] Persist Claude usage snapshots in SQLite through `electron-app/src/main/storage/history.ts`, but keep advanced history visualization for Phase 3.

## Green
- [ ] Step 2.8: [automated] Make all Phase 2 tests pass and add integration coverage proving renderer state omits secrets while main-process state can fetch/update Claude usage.
- [ ] Step 2.9: [automated] Run Phase 2 verification: `npm run typecheck`, `npm test`, `npm run build`, and an Electron smoke launch using mocked Claude responses.

## Milestone
- [ ] Claude exact usage works end-to-end in Electron with account management and secure secrets.
- [ ] Auth expiry, network errors, manual refresh, backoff, reset fetch, and session-key rotation are covered.
- [ ] Renderer never receives session keys.
- [ ] Tray and popover show live Claude state.
- [ ] All phase tests pass.
- [ ] No regressions.

## Next Step Plan: Step 2.1

Write the red-phase tests for Phase 2. Keep this step test-only except for tiny exported seams needed by the tests. Do not implement account persistence, network fetching, polling, or real IPC state yet.

Validation for the red phase:
- Run `npm test -- --run` from `electron-app/` and confirm the new Phase 2 tests fail for expected missing modules or not-yet-implemented behavior.
- Run a targeted existing foundation test if needed to confirm no accidental Phase 1 regression.
- Record the expected failures in the Step 2.1 review before marking the step complete.
