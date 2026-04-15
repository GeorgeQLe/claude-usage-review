# Phase 1: Electron Runtime Foundation

> Project: ClaudeUsage Electron cross-platform app
> Source: `specs/electron-cross-platform-ai-usage-monitor.md`
> Scope: Create the secure Electron/React runtime foundation for the Windows/Linux implementation while keeping Swift as the premium macOS app.
> Test strategy: tests-after

## Implementation
- [x] Step 1.1: [automated] Scaffold `electron-app/` with Electron, React, TypeScript, Vite, Electron Builder, Vitest, and project scripts in `electron-app/package.json`, `electron-app/vite.config.ts`, `electron-app/electron-builder.yml`, `electron-app/tsconfig*.json`, and `electron-app/src/`.
- [x] Step 1.2: [automated] Add the initial folder/module structure from the spec: `electron-app/src/main/`, `electron-app/src/preload/`, `electron-app/src/renderer/`, and `electron-app/src/shared/`, including shared type/schema placeholders for accounts, usage state, provider cards, settings, and IPC payloads.
- [x] Step 1.3: [automated] Implement the secure Electron main-process bootstrap in `electron-app/src/main/app.ts`, `electron-app/src/main/windows.ts`, and `electron-app/src/main/tray.ts`: single-instance lock, app lifecycle, tray creation, context menu skeleton, popover/settings/overlay/onboarding windows, CSP-ready local loading, and Linux tray fallback handling.
- [x] Step 1.4: [automated] Add a narrow preload bridge in `electron-app/src/preload/index.ts` and `electron-app/src/preload/api.ts` using `contextBridge`, with Node integration disabled and context isolation/sandbox options set on all renderer windows.
- [x] Step 1.5: [automated] Add IPC registration and validation skeletons in `electron-app/src/main/ipc.ts` plus shared schemas under `electron-app/src/shared/schemas/` for the commands listed in the spec.
- [x] Step 1.6: [automated] Add storage primitives in `electron-app/src/main/storage/`: SQLite connection/migrations for structured app data, `safeStorage` secret wrapper, redaction helpers, and a Linux `basic_text` backend warning surfaced through derived app state.
- [x] Step 1.7: [automated] Add minimal React renderer entries for popover, settings, onboarding, and overlay under `electron-app/src/renderer/`, with placeholder state loaded through the preload API and no direct filesystem or Node access.

## Green
- [x] Step 1.8: [automated] Add regression coverage for the foundation: Vitest tests for schema validation/redaction/storage wrappers where possible, an Electron main-process smoke test for window/tray action routing, and a renderer smoke test proving placeholder windows mount without secret/Node access.
- [x] Step 1.9: [automated] Run Phase 1 verification: `npm run typecheck`, `npm test`, `npm run build`, and an Electron dev launch smoke command from `electron-app/`.

## Milestone
- [x] `electron-app/` exists and starts locally.
- [x] Main/preload/renderer boundaries are in place and secure by default.
- [x] Renderer windows mount through React and only use the typed preload API.
- [x] SQLite and secret-storage abstractions exist, with Linux weak-backend warning plumbing.
- [x] Tray, popover, settings, onboarding, and overlay window shells exist.
- [x] All phase tests pass.
- [x] No regressions.

## Review: Step 1.3

Implemented the Electron main-process runtime foundation:
- `electron-app/src/main/app.ts` now owns the single-instance lock, app lifecycle hooks, second-instance focus behavior, activation behavior, startup orchestration, and tray fallback reporting.
- `electron-app/src/main/windows.ts` now provides secure typed `BrowserWindow` helpers for popover, settings, overlay, and onboarding. Each window uses `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, the compiled preload path, guarded navigation, hidden-until-ready loading, and dev/prod renderer resolution.
- `electron-app/src/main/tray.ts` now creates a tray controller with a context menu skeleton, routes menu actions to shell windows, creates a generated tray image, and records Linux tray fallback status when tray creation is not available.

Validation passed from `electron-app/`:
- `npm run typecheck`
- `npm test -- --run`
- `npm run build`
- Smoke check confirmed `dist-electron/main/app.js`, `dist-electron/preload/index.js`, and `dist/index.html` exist after build.

No warnings were emitted by validation.

## Next Step Plan: Step 1.4

Add the narrow preload bridge on top of the secure windows created in Step 1.3. Keep this step focused on the renderer-facing API boundary only; do not add real storage, provider polling, or credential handling yet.

Files to modify or create:
- `electron-app/src/preload/api.ts`: replace the direct placeholder-returning API with a narrow typed API surface that calls Electron IPC through `ipcRenderer.invoke` for allowed commands only. Keep the API readonly, promise-based, and limited to current scaffold methods (`version`, `getUsageState`, `getSettings`, `getAccounts`) unless Step 1.5 requires more channels later.
- `electron-app/src/preload/index.ts`: expose the API with `contextBridge.exposeInMainWorld("claudeUsage", ...)`, avoid leaking `ipcRenderer`, Node globals, or arbitrary channel access, and add a small global type declaration if needed for renderer TypeScript.
- `electron-app/src/main/windows.ts`: verify the Step 1.3 window defaults still enforce `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true` for every renderer window. Only edit if Step 1.4 needs a small refinement.
- `electron-app/src/shared/types/ipc.ts` or `electron-app/src/shared/schemas/ipc.ts`: add or refine preload-facing request/response type placeholders only if it keeps the bridge typed without implementing Step 1.5 validation yet.
- `electron-app/src/renderer/`: update only minimal TypeScript declarations if the renderer needs access to `window.claudeUsage` without direct Node access.

Validation:
- Run `npm run typecheck`, `npm test -- --run`, and `npm run build` from `electron-app/`.
- Inspect compiled preload output to confirm the packaged preload entry remains `dist-electron/preload/index.js`.
- Confirm no renderer code imports from `electron`, `node:*`, or direct filesystem APIs.

## Review: Step 1.4

Implemented the narrow Electron preload bridge:
- `electron-app/src/preload/api.ts` now exposes only the current scaffold API (`version`, `getUsageState`, `getSettings`, `getAccounts`) and maps each method to an allowlisted `ipcRenderer.invoke` channel. It does not expose `ipcRenderer`, arbitrary channel access, Electron objects, Node globals, or filesystem APIs to renderer code.
- `electron-app/src/preload/index.ts` now exposes a frozen `window.claudeUsage` object through `contextBridge.exposeInMainWorld`.
- `electron-app/src/shared/types/ipc.ts` now owns shared IPC channel names plus a typed `PreloadInvokeMap` for preload-accessible request/response shapes. `electron-app/src/main/ipc.ts` re-exports those shared names so Step 1.5 can add handlers without duplicating channel constants.
- `electron-app/src/renderer/global.d.ts` declares the typed `window.claudeUsage` surface for renderer TypeScript.
- `electron-app/src/main/windows.ts` already enforces `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, and `allowRunningInsecureContent: false` for all renderer windows, so no window changes were needed.

Validation passed from `electron-app/`:
- `npm run typecheck`
- `npm test -- --run`
- `npm run build`
- Smoke check confirmed `dist-electron/preload/index.js` still exists after build.
- Source scan confirmed renderer/shared code has no `electron`, `node:*`, or direct filesystem imports.

No warnings were emitted by validation.

Known boundary for the next step:
- The preload API now invokes typed IPC channels, but main-process handlers are intentionally not registered yet. Step 1.5 owns handler registration, schema validation, and placeholder responses.

## Next Step Plan: Step 1.5

Add the main-process IPC registration and validation skeletons that service the allowlisted preload bridge from Step 1.4. Keep this step focused on command registration, request/response validation, and safe placeholder state. Do not add real SQLite storage, secret storage, provider polling, or renderer UI behavior yet.

Files to modify or create:
- `electron-app/src/main/ipc.ts`: replace the current re-export-only skeleton with a `registerIpcHandlers(...)` function that registers handlers for the commands listed in the Phase 1 spec. It should use the shared `ipcChannelNames`, return safe placeholder state for read commands, validate payloads for write commands, and expose a small disposer/unregister helper if practical.
- `electron-app/src/main/app.ts`: call `registerIpcHandlers(...)` during startup before windows can invoke the preload API. Keep dependencies explicit and do not create long-lived service objects beyond placeholder state required for this skeleton.
- `electron-app/src/shared/schemas/ipc.ts`: add command-level validation helpers or schemas for every payload-bearing command: settings update, add/rename/remove/switch account, refresh, and provider-style command placeholders only where the roadmap requires them.
- `electron-app/src/shared/types/ipc.ts`: add request/response mappings for the registered commands so preload and main stay typed from the same source of truth.
- `electron-app/src/shared/schemas/accounts.ts`, `electron-app/src/shared/schemas/settings.ts`, and `electron-app/src/shared/schemas/usage.ts`: reuse existing schemas for response validation. Refine only if the IPC skeleton needs safe placeholder state to satisfy the schemas.
- `electron-app/src/preload/api.ts`: extend the preload API only for scaffold commands that Step 1.5 registers and that the renderer will need in later steps. Keep the allowlist pattern; do not add arbitrary invoke/send methods.

Implementation notes:
- Register handlers with `ipcMain.handle` and validate all incoming payloads with Zod before mutating or returning placeholder state.
- Return secret-free placeholder account, settings, and usage state objects. Any credential payload accepted in this step must be validated and discarded or represented only as safe metadata; never echo session keys to renderer responses.
- Prefer small pure helpers for `parsePayload` and safe placeholder state so Step 1.8 can test validation without booting a full Electron app.
- Ensure handler registration is idempotent or returns a disposer so tests and app shutdown can avoid duplicate-handler collisions.

Validation:
- Run `npm run typecheck`, `npm test -- --run`, and `npm run build` from `electron-app/`.
- Confirm no renderer code imports from `electron`, `node:*`, or direct filesystem APIs.
- Inspect the final IPC surface to confirm there is still no arbitrary channel bridge and no secret-bearing response shape.

## Review: Step 1.5

Implemented the Electron IPC registration and validation skeleton:
- `electron-app/src/main/ipc.ts` now registers allowlisted `ipcMain.handle` handlers for usage, settings, account, Claude credential/test, provider diagnostics/detection, wrapper, and diagnostics-export commands. It returns safe in-memory placeholder state, validates incoming payloads with Zod, validates response shapes before returning them, broadcasts validated usage updates after `refreshNow`, and returns a disposer that removes registered handlers.
- `electron-app/src/main/app.ts` now registers IPC handlers during startup before renderer windows can invoke the preload API, and disposes handlers on app quit.
- `electron-app/src/shared/types/ipc.ts` now owns the expanded channel list, typed preload invoke map, and placeholder response contracts for all Step 1.5 commands.
- `electron-app/src/shared/schemas/ipc.ts` now includes payload schemas and placeholder response schemas for every payload-bearing command in the skeleton.
- `electron-app/src/preload/api.ts` now exposes the expanded narrow API through allowlisted `ipcRenderer.invoke` calls plus a validated `subscribeUsageUpdated` event bridge. It still does not expose arbitrary channel access, `ipcRenderer`, Electron objects, Node globals, or filesystem APIs.

Validation passed from `electron-app/`:
- `npm run typecheck`
- `npm test -- --run`
- `npm run build`
- Smoke check confirmed `dist-electron/preload/index.js` exists after build.
- Source scan confirmed renderer/shared code has no direct imports from `electron`, `node:*`, `fs`, `path`, `os`, `crypto`, or `child_process`.
- IPC surface inspection confirmed credential payloads are validated but not returned in response shapes.

No warnings were emitted by validation.

Known boundary for the next step:
- IPC state is intentionally in-memory placeholder state. Step 1.6 owns durable SQLite primitives, secret storage, redaction helpers, and Linux weak-backend warning plumbing.

## Next Step Plan: Step 1.6

Add the storage primitives that later IPC/provider work can depend on. Keep this step focused on reusable storage boundaries only; do not wire real provider polling, renderer UI, or full account workflows yet.

Files to create or modify:
- `electron-app/package.json` and lockfile: add the SQLite dependency chosen for the Electron main process if one is not already available. Prefer a maintained synchronous SQLite binding that works with Electron packaging, unless the existing toolchain strongly points elsewhere.
- `electron-app/src/main/storage/database.ts`: add a small SQLite connection factory rooted under Electron `app.getPath("userData")`, plus a test-friendly override path.
- `electron-app/src/main/storage/migrations.ts`: add an idempotent migration runner and initial schema for accounts, settings, usage snapshots, provider settings, wrapper events, parse bookmarks, diagnostics/events, and migration records at the lightweight skeleton level.
- `electron-app/src/main/storage/secrets.ts`: wrap Electron `safeStorage` for encrypt/decrypt/delete-style operations without exposing decrypted values beyond main-process callers.
- `electron-app/src/main/storage/redaction.ts`: add redaction helpers for session keys, bearer-like tokens, cookie values, and diagnostic payloads.
- `electron-app/src/main/storage/index.ts`: export the storage primitives through a small main-process-only boundary.
- `electron-app/src/shared/schemas/usage.ts` or related shared schemas: refine only if the Linux weak-backend warning needs a typed app-state warning shape.
- `electron-app/src/main/ipc.ts`: only adjust placeholder state if needed to surface a Linux `safeStorage` `basic_text` warning through the existing usage/settings state without storing secrets.

Implementation notes:
- Detect `safeStorage.getSelectedStorageBackend()` when available and derive a warning if Linux reports `basic_text`.
- Keep storage code out of preload and renderer modules. Renderer must not import storage primitives or receive secrets.
- Make migrations idempotent and cheap to run at startup later, but this step does not need to wire them into startup unless the storage factory requires it.
- Keep schema names stable and simple so later phases can extend columns without rewriting the foundation.

Validation:
- Run `npm run typecheck`, `npm test -- --run`, and `npm run build` from `electron-app/`.
- Confirm no renderer/shared code imports storage modules, `electron`, `node:*`, or direct filesystem APIs.
- If SQLite dependency installation or native build is required, verify the dependency can install/build locally before marking the step complete.

## Review: Step 1.6

Implemented the Electron main-process storage primitives:
- `electron-app/src/main/storage/database.ts` now provides a SQLite connection factory rooted under Electron `app.getPath("userData")`, with explicit path/base-dir/in-memory overrides for later tests and callers.
- `electron-app/src/main/storage/migrations.ts` now owns an idempotent migration runner plus the initial lightweight schema for account metadata, app settings, provider settings, usage snapshots, wrapper events, parse bookmarks, diagnostics events, migration records, and schema migration records.
- `electron-app/src/main/storage/secrets.ts` now wraps Electron `safeStorage` for encrypt/decrypt/clear-style secret handling and reports storage backend status without exposing decrypted values to renderer-facing code.
- `electron-app/src/main/storage/redaction.ts` now redacts session keys, bearer tokens, GitHub-style tokens, cookie values, secret-like object fields, raw prompts, and raw stdout-like diagnostic payload fields.
- `electron-app/src/main/storage/index.ts` exports the main-process-only storage boundary.
- `electron-app/src/main/ipc.ts` now derives the placeholder usage warning from `safeStorage` status, surfacing a Linux `basic_text` backend warning through existing app state.

Implementation note:
- No SQLite npm dependency was added. The foundation uses Electron's bundled Node 24 `node:sqlite` API, which avoids native Electron ABI rebuild work for this phase while still providing a real SQLite connection and migration boundary.

Validation passed from `electron-app/`:
- `npm run typecheck`
- `npm test -- --run`
- `npm run build`
- Source scan confirmed renderer/shared code has no direct imports from `electron`, `node:*`, filesystem, crypto, child-process, or storage modules.

No warnings were emitted by validation.

Known boundary for the next step:
- Storage primitives exist but are intentionally not wired into real account/provider workflows yet. Later phases own durable account persistence, credential CRUD, history storage, and diagnostics export integration.

## Next Step Plan: Step 1.7

Add minimal React renderer entries for popover, settings, onboarding, and overlay that load placeholder state through the typed preload API. Keep this step focused on renderer mounting and the preload boundary; do not add real provider polling, durable storage workflows, or polished product UI.

Files to create or modify:
- `electron-app/src/renderer/app/index.tsx`: load usage state, settings, and accounts through `window.claudeUsage`; render placeholder provider cards, account status, refresh action, and safe warning text.
- `electron-app/src/renderer/settings/index.ts`: mount a minimal settings React entry that reads placeholder settings/accounts through the preload API and uses write-only credential placeholders without rendering secrets.
- `electron-app/src/renderer/onboarding/index.ts`: mount a minimal onboarding React entry that reads accounts/settings and presents placeholder setup flow state.
- `electron-app/src/renderer/overlay/index.ts`: mount a minimal overlay React entry that reads usage state and displays compact placeholder provider status.
- `electron-app/src/renderer/components/`: add only small shared components if they remove real duplication across the four entries.
- `electron-app/src/renderer/global.d.ts`: refine only if the renderer needs additional type coverage for `window.claudeUsage`.
- `electron-app/src/renderer/styles/app.css`: add minimal layout styles while keeping the primary UI stable and not dependent on Node or filesystem APIs.

Implementation notes:
- All renderer data must come through the typed preload API. Do not import Electron, `node:*`, filesystem, crypto, or main-process modules in renderer/shared files.
- Treat credentials as write-only placeholders. Never render stored session keys or tokens.
- Prefer small pure React components that can be smoke-tested in Step 1.8.

Validation:
- Run `npm run typecheck`, `npm test -- --run`, and `npm run build` from `electron-app/`.
- Confirm renderer/shared code has no direct imports from `electron`, `node:*`, direct filesystem APIs, crypto, child process, or `src/main/storage`.
- Inspect the built renderer output enough to confirm all four route entries compile through Vite.

## Review: Step 1.7

Implemented the minimal React renderer entries:
- `electron-app/src/renderer/app/index.tsx` now routes the single Vite entry by the Electron hash (`popover`, `settings`, `onboarding`, `overlay`) and mounts the matching React route.
- `electron-app/src/renderer/components/index.tsx` now provides the shared renderer snapshot hook and small UI primitives for loading, error, warning, provider, account, settings, and write-only credential states. All renderer state loads through `window.claudeUsage`.
- `electron-app/src/renderer/settings/index.tsx`, `electron-app/src/renderer/onboarding/index.tsx`, and `electron-app/src/renderer/overlay/index.tsx` now render placeholder state through the typed preload API. The Settings credential form clears the session key after save and never renders stored secrets.
- `electron-app/src/renderer/styles/app.css` now covers stable minimal layouts for the four windows.

Validation passed from `electron-app/`:
- `npm run typecheck`
- `npm test -- --run`
- `npm run build`
- Source scan confirmed renderer/shared code has no direct imports from `electron`, `node:*`, direct filesystem APIs, crypto, child process, or `src/main/storage`.
- Build output confirmed the renderer bundle compiles through Vite with the route modules included.

No warnings were emitted by validation.

Known boundary for the next step:
- Renderer route smoke coverage is not yet automated. Step 1.8 owns regression tests for renderer mounting, storage/redaction/schema helpers, and main-process window/tray action routing.

## Next Step Plan: Step 1.8

Add regression coverage for the Phase 1 foundation. Keep this step focused on test coverage; do not add production behavior beyond small testability seams if a seam is required to exercise existing code.

Files to create or modify:
- `electron-app/src/shared/schemas/*.test.ts` or a focused schema test file: cover IPC payload validation for settings/account/provider commands and usage/account/settings response shape validation.
- `electron-app/src/main/storage/redaction.test.ts`: cover session keys, bearer tokens, cookie values, secret-like fields, prompts, and stdout-like diagnostic payload redaction.
- `electron-app/src/main/storage/secrets.test.ts`: cover safeStorage wrapper behavior with mocked backend status where practical, especially Linux `basic_text` warning derivation.
- `electron-app/src/main/storage/migrations.test.ts`: cover idempotent migration execution against an in-memory SQLite connection if the Electron-bundled `node:sqlite` API is usable under the current test runner.
- `electron-app/src/main/windows.test.ts` or a testable helper module: cover window descriptor routing and tray/menu action intent mapping without requiring a full Electron app when possible.
- `electron-app/src/renderer/*.test.tsx` or route-level smoke tests: mount popover/settings/onboarding/overlay routes with a mocked `window.claudeUsage` preload API and prove they render placeholder state without Node or secret exposure.
- `electron-app/src/scaffold.test.ts`: keep or replace only if the new focused tests make the scaffold smoke test redundant.

Implementation notes:
- Prefer pure helper exports and dependency injection over starting a real Electron process in Vitest.
- Mock `window.claudeUsage` in renderer tests; do not import `electron`, `node:*`, filesystem, crypto, child process, or main-process storage into renderer tests.
- Validate that credential inputs are write-only from the renderer perspective: session keys can be typed and submitted, but saved secrets are not rendered back.
- Keep tests deterministic and small; Phase 1.9 owns the full verification gate and Electron dev launch smoke command.

Validation:
- Run `npm run typecheck`, `npm test -- --run`, and `npm run build` from `electron-app/`.
- Re-run the renderer/shared forbidden-import source scan.

## Review: Step 1.8

Added regression coverage for the Electron runtime foundation:
- `electron-app/src/foundation-schemas.test.ts` now covers IPC payload validation, response shape validation, settings patch validation, and secret-free credential result contracts.
- `electron-app/src/foundation-storage.test.ts` now covers redaction helpers, the injected `safeStorage` wrapper, Linux `basic_text` warning derivation, and the storage migration runner/schema contract.
- `electron-app/src/foundation-main.test.ts` now covers window descriptor routing, secure window preferences through a mocked `BrowserWindow`, overlay toggle reuse, tray skeleton actions, and tray menu callback routing without launching a full Electron app.
- `electron-app/src/foundation-renderer.test.tsx` now mounts popover, settings, onboarding, and overlay routes with a mocked preload API and verifies Claude credentials remain write-only after save.
- `electron-app/src/renderer/app/index.tsx` now exports testable route/mount helpers while preserving production auto-mount behavior.
- The coverage found and fixed the settings update contract: `updateSettings` now accepts deep partial overlay patches consistently across Zod validation, shared IPC types, preload typing, and main-process state merging.

Validation passed from `electron-app/`:
- `npm run typecheck`
- `npm test -- --run` — 22 tests passed.
- `npm run build` — typecheck, tests, main compile, and Vite renderer build passed.
- Forbidden-import source scan confirmed renderer/shared code has no direct imports from `electron`, `node:*`, filesystem, crypto, child process, or `src/main/storage`.

No warnings were emitted by validation.

## Review: Step 1.9

Completed the Phase 1 verification gate for the Electron runtime foundation:
- `npm run typecheck` passed from `electron-app/`.
- `npm test` passed from `electron-app/`: 5 test files and 22 tests.
- `npm run build` passed from `electron-app/`, including typecheck, Vitest with `--run`, main-process TypeScript compilation, and Vite renderer build.
- Confirmed the expected build artifacts exist: `dist-electron/main/app.js`, `dist-electron/preload/index.js`, and `dist/index.html`.
- Re-ran the renderer/shared forbidden-import scan and confirmed there are no direct imports from Electron, Node, filesystem, crypto, child process, or main-process storage modules.
- Ran a bounded Electron dev launch smoke with `npm run dev`. Vite started on `127.0.0.1:5173`, the Electron main build completed, Electron stayed running without startup error output, and the smoke processes were stopped cleanly afterward.

No warnings were emitted by validation.

## On Completion

Phase 1 completed on 2026-04-15. The Electron app now has a secure main/preload/renderer foundation, typed IPC validation skeleton, SQLite and secret-storage primitives, Linux weak-storage warning plumbing, tray/window shells, minimal React routes, and regression coverage. Phase 2 should build on this foundation by replacing placeholder account/Claude state with durable account persistence, secret-backed Claude credentials, exact Claude usage polling, and live renderer state while preserving the no-renderer-secrets boundary.
