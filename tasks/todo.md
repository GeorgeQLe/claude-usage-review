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
- [x] Step 2.5: [automated] Wire account and Claude commands through `electron-app/src/main/ipc.ts` and `electron-app/src/preload/api.ts`, including add/rename/remove/switch account, save credentials, test connection, get usage state, refresh now, and subscribe to usage updates.

  **Step 2.5 Review:**
  - Extended `registerIpcHandlers(dependencies?)` in `electron-app/src/main/ipc.ts` so durable account, credential, Claude client, and usage-state adapters can be injected while the default app-startup path keeps Phase 1 placeholder behavior.
  - Wired account add/rename/remove/switch commands through injected account services and made credential saves write the Claude session key through an injected credential store before saving org/auth metadata.
  - Wired `testClaudeConnection` through the Claude usage client and returns sanitized `connected`, `auth_expired`, `network_error`, or `invalid` results without echoing submitted or rotated session keys.
  - Added account-scoped Claude credential storage in `electron-app/src/main/storage/secrets.ts`, plus shared Claude usage schemas in `electron-app/src/shared/schemas/claudeUsage.ts`.
  - Added account auth-status persistence support via `setAuthStatus` in `electron-app/src/main/storage/accounts.ts`.
  - `npm run typecheck` passes from `electron-app/`.
  - `npm test -- --run src/main/ipc.test.ts src/main/storage/secrets.test.ts src/shared/schemas/claudeUsage.test.ts` passes with 3 files and 8 tests.
  - `npm test -- --run src/main/services/polling.test.ts src/main/services/claudeUsage.test.ts src/main/storage/accounts.test.ts` passes with 3 files and 11 tests.
  - Accepted warning: Node prints `ExperimentalWarning: SQLite is an experimental feature` while opening the in-memory SQLite database in account tests.
  - `npm run build` was not run because the build script executes the full Phase 2 test suite, which is still expected to remain red for renderer UI and history snapshot work until Steps 2.6-2.8.
- [x] Step 2.6: [automated] Implement Claude-aware tray/popover/settings/onboarding UI in `electron-app/src/renderer/`, including write-only credential fields, account picker, auth status, exact usage bars, refresh actions, and basic error states.

  **Step 2.6 Review:**
  - Expanded `useRendererSnapshot` with renderer-safe account mutations, credential save, connection test, refresh, and usage-update subscription helpers.
  - Replaced placeholder Claude renderer views with exact Claude usage cards, five-hour and weekly utilization bars, reset/updated/account/auth summaries, and compact later-phase cards for Codex/Gemini.
  - Added reusable account controls for create/rename/remove/switch flows in Settings and Onboarding.
  - Upgraded the credential flow to write-only session-key inputs with sanitized connection-test feedback; session keys are cleared after save/test and never rendered back into the DOM.
  - Updated Popover, Settings, Onboarding, and Overlay routes to use the Claude-aware UI and sanitized preload API state.
  - `npm run typecheck` passes from `electron-app/`.
  - `npm test -- --run src/foundation-renderer.test.tsx src/foundation-schemas.test.ts src/main/ipc.test.ts src/main/storage/secrets.test.ts src/shared/schemas/claudeUsage.test.ts` passes with 5 files and 17 tests.
  - `npm run build:renderer` passes from `electron-app/`.
  - `npm run build` was not run because it executes the full Phase 2 test suite, which is still expected to remain red for history snapshot work until Step 2.7 and the green gate in Step 2.8.
- [x] Step 2.7: [automated] Persist Claude usage snapshots in SQLite through `electron-app/src/main/storage/history.ts`, but keep advanced history visualization for Phase 3.

  **Step 2.7 Review:**
  - Added `createUsageHistoryStore` in `electron-app/src/main/storage/history.ts` over the existing `usage_snapshots` SQLite table.
  - Added focused history coverage for recording Claude snapshots, listing recent snapshots by account/provider newest-first with limits, preserving normalized metrics and raw `payload_json`, and keeping historical snapshots after account deletion via `account_id = NULL`.
  - The history store validates payloads through `claudeUsageDataSchema`, stores only usage/account/provider data, and does not persist session keys, cookies, request headers, or credential test payloads.
  - Exported the history store through `electron-app/src/main/storage/index.ts` and exported Claude usage schema types for shared storage typing.
  - `npm run typecheck` passes from `electron-app/`.
  - `npm test -- --run src/main/storage/history.test.ts src/main/storage/accounts.test.ts src/foundation-storage.test.ts` passes with 3 files and 13 tests.
  - `npm test -- --run src/main/services/polling.test.ts src/main/services/claudeUsage.test.ts` passes with 2 files and 8 tests.
  - `npm test -- --run` passes with 12 files and 44 tests.
  - `npm run build` passes from `electron-app/`.
  - Accepted warning: Node prints `ExperimentalWarning: SQLite is an experimental feature` while opening the in-memory SQLite database in storage tests.

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

## Next Step Plan: Step 2.8

Add integration coverage proving renderer state omits secrets while main-process state can fetch/update Claude usage, then keep the full Phase 2 suite green. The current full suite passes after Step 2.7, so Step 2.8 should focus on closing the remaining end-to-end confidence gap rather than broadening into Phase 3 UI.

Implementation outline:
- Run `npm test -- --run` from `electron-app/` first and treat any failure as a regression to fix before adding new coverage.
- Add or update integration coverage for the main-process flow: account metadata + account-scoped session key secret + Claude usage client + polling scheduler + history snapshot persistence. Use mocked Claude responses and fake timers; do not call the live Claude API.
- Wire snapshot recording into the polling/update path only at the main-process service boundary. On successful Claude fetch, persist the sanitized usage payload through `createUsageHistoryStore`; do not persist session keys, cookies, request headers, or connection-test payloads.
- Ensure renderer-visible state and preload responses remain secret-free. Add assertions that `getUsageState`, usage-updated events, account summaries, and connection-test responses never include submitted or rotated session keys.
- Preserve existing renderer behavior from Step 2.6 and storage behavior from Step 2.7; do not add Phase 3 history visualization.
- Fix any remaining Phase 2 test failures, including stale placeholder defaults, schema gaps, or IPC injection edges revealed by the full suite.

Validation for Step 2.8:
- Run `npm run typecheck` from `electron-app/`.
- Run the focused integration tests added or changed for this step.
- Run `npm test -- --run` from `electron-app/` and keep the full Phase 2 suite passing.
- Run `npm run build` unless it is reserved for Step 2.9's Electron smoke/build gate.
