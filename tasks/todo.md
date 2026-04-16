# Phase 2: Claude Exact Usage and Accounts

> Project: ClaudeUsage Electron cross-platform app
> Source: `specs/electron-cross-platform-ai-usage-monitor.md`
> Scope: Replace Phase 1 placeholder Claude/account state with durable account metadata, secret-backed credentials, exact Claude usage fetching, polling, and live renderer/tray state. Preserve the secure Electron boundary: renderer code never receives session keys or direct Node/filesystem access.
> Test strategy: tdd

## Tests First
- [x] Step 2.1: [automated] Add failing tests for Claude API parsing, `Set-Cookie` session-key rotation, account metadata CRUD, secret write/read/delete, polling backoff, reset-time fetch scheduling, auth-expired handling, and typed IPC command validation under `electron-app/src/main/**/__tests__/` and `electron-app/src/shared/**/__tests__/`.

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

  **Step 2.1 Review:**
  - Added red-phase Vitest coverage for Claude usage fetching/parsing/session rotation, account metadata CRUD, credential secret persistence, polling cadence/backoff/reset/auth-expired behavior, IPC command validation/service wiring, and Phase 2 Claude usage schemas.
  - `npm run typecheck` passes from `electron-app/`.
  - `npm test -- --run src/foundation-main.test.ts src/foundation-storage.test.ts src/foundation-schemas.test.ts src/foundation-renderer.test.tsx src/scaffold.test.ts` passes with 5 files and 22 tests.
  - `npm test -- --run` fails as expected with 17 red-phase failures: missing `claudeUsage.js`, `accounts.js`, `polling.js`, missing `createClaudeCredentialStore`, placeholder IPC not calling injected durable services, and the connection-result schema not yet accepting `connected`.
  - Accepted warning: Node prints `ExperimentalWarning: SQLite is an experimental feature` while opening the in-memory SQLite database in the new account tests.

## Implementation
- [x] Step 2.2: [automated] Implement account metadata and active-account persistence in `electron-app/src/main/storage/accounts.ts`, with session keys stored only through the secret store and never serialized to renderer state.

  **Step 2.2 Review:**
  - Added `createAccountStore` in `electron-app/src/main/storage/accounts.ts` over the existing SQLite `accounts` table.
  - Implemented add, rename, remove, switch active account, org-ID save, account listing, and active-account lookup.
  - Account store results use renderer-safe `AccountSummary` fields only: `id`, `label`, `orgId`, `isActive`, and `authStatus`.
  - Active-account state is normalized after create/delete/switch so one account is active when accounts exist.
  - Exported the account store through `electron-app/src/main/storage/index.ts`.
  - `npm run typecheck` passes from `electron-app/`.
  - `npm test -- --run src/main/storage/accounts.test.ts src/foundation-storage.test.ts` passes with 2 files and 10 tests.
  - Accepted warning: Node prints `ExperimentalWarning: SQLite is an experimental feature` while opening the in-memory SQLite database in account tests.
- [x] Step 2.3: [automated] Implement the Claude usage client in `electron-app/src/main/services/claudeUsage.ts`, matching the Swift/Tauri API behavior: `sessionKey` cookie, `anthropic-client-platform: web_claude_ai`, all known usage limit fields, 401/403 auth expiry, and session-key rotation.

  **Step 2.3 Review:**
  - Added `createClaudeUsageClient` in `electron-app/src/main/services/claudeUsage.ts`.
  - The client requests `https://claude.ai/api/organizations/{orgId}/usage` with Claude web-client headers and a `sessionKey` cookie.
  - Normalized known Claude limit fields into camel-case usage data, including nullable Sonnet/Opus/OAuth Apps/Cowork limits, unknown non-extra fields as `other`, and `extra_usage` without requiring `resets_at`.
  - Added `parseRotatedSessionKey` to extract only `sessionKey` from `Set-Cookie`; no storage or renderer state wiring was added in this step.
  - Classified 401/403 as `{ kind: "auth_expired" }`, fetch failures as `{ kind: "network_error" }`, and malformed payloads as `{ kind: "invalid_response" }`.
  - `npm run typecheck` passes from `electron-app/`.
  - `npm test -- --run src/main/services/claudeUsage.test.ts` passes with 1 file and 4 tests.
  - `npm test -- --run src/main/services/claudeUsage.test.ts src/main/storage/accounts.test.ts src/foundation-storage.test.ts` passes with 3 files and 14 tests.
  - Accepted warning: Node prints `ExperimentalWarning: SQLite is an experimental feature` while opening the in-memory SQLite database in account/storage tests.
- [x] Step 2.4: [automated] Implement polling and scheduling in `electron-app/src/main/services/polling.ts`: 5-minute default cadence, exponential network backoff, manual refresh, reset-time fetch, cancellation on account switch, and event emission to renderers.

  **Step 2.4 Review:**
  - Added `createUsagePollingScheduler` in `electron-app/src/main/services/polling.ts`.
  - The scheduler polls immediately on start, resumes the 5-minute success cadence, and schedules future reset-time fetches when Claude returns `fiveHour.resetsAt`.
  - Network errors now use exponential backoff from the documented 300-second base: 600 seconds, 1200 seconds, capped at 3600 seconds, and reset after a successful fetch.
  - Manual refresh, account switching, stop/cancellation, auth-expired handling, renderer-safe state emission, and rotated session-key callbacks are implemented through injected main-process services.
  - `npm run typecheck` passes from `electron-app/`.
  - `npm test -- --run src/main/services/polling.test.ts` passes with 1 file and 4 tests.
  - `npm test -- --run src/main/services/polling.test.ts src/main/services/claudeUsage.test.ts src/main/storage/accounts.test.ts` passes with 3 files and 11 tests.
  - Accepted warning: Node prints `ExperimentalWarning: SQLite is an experimental feature` while opening the in-memory SQLite database in account tests.
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

## Next Step Plan: Step 2.5

Wire the durable account, credential, Claude client, and polling services into the Electron IPC boundary in `electron-app/src/main/ipc.ts` and keep the preload API contract in `electron-app/src/preload/api.ts` secret-free. Match the red-phase IPC contract in `electron-app/src/main/ipc.test.ts` while preserving Phase 1 placeholder behavior for unrelated settings/provider/diagnostics commands.

Implementation outline:
- Extend `registerIpcHandlers(dependencies?)` so tests and app startup can inject durable services without requiring Electron app bootstrap changes in this step.
- Add or complete a Claude credential store in `electron-app/src/main/storage/secrets.ts` if needed by the IPC tests: `writeClaudeSessionKey(accountId, sessionKey)`, `readClaudeSessionKey(accountId)`, and `deleteClaudeSessionKey(accountId)` should use the existing safeStorage envelope boundary and never expose decrypted values to renderer responses.
- Wire account commands to `AccountStore`: `getAccounts`, `addAccount`, `renameAccount`, `removeAccount`, and `setActiveAccount`.
- Wire `saveClaudeCredentials` so it writes the session key through the credential store, saves the org ID through the account store, marks/returns a configured account summary when appropriate, and never returns the submitted session key.
- Wire `testClaudeConnection` through `ClaudeUsageClient.fetchUsage({ orgId, sessionKey })`; return a sanitized `{ ok: true, status: "connected", message: "Claude connection succeeded." }` on success and sanitized invalid/auth/network results on failure.
- Wire `getUsageState`, `refreshNow`, and `usage:updated` to the polling scheduler or a small adapter around it so renderer-visible state validates against `usageStateSchema` and contains no `sessionKey`/`sk-ant` material.
- Update shared IPC result schemas/types only as required by the real connected/invalid statuses.
- Keep renderer/preload method names stable. The preload should continue to validate incoming `usage:updated` payloads and expose unsubscribe cleanup.

Validation for Step 2.5:
- Run `npm run typecheck` from `electron-app/`.
- Run `npm test -- --run src/main/ipc.test.ts src/main/storage/secrets.test.ts src/shared/schemas/claudeUsage.test.ts`.
- Run `npm test -- --run src/main/services/polling.test.ts src/main/services/claudeUsage.test.ts src/main/storage/accounts.test.ts` to confirm Step 2.2-2.4 service behavior still passes.
- The broader Phase 2 suite may remain red for renderer UI and history snapshots until later steps.
