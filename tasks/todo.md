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
- [ ] Step 1.6: [automated] Add storage primitives in `electron-app/src/main/storage/`: SQLite connection/migrations for structured app data, `safeStorage` secret wrapper, redaction helpers, and a Linux `basic_text` backend warning surfaced through derived app state.
- [ ] Step 1.7: [automated] Add minimal React renderer entries for popover, settings, onboarding, and overlay under `electron-app/src/renderer/`, with placeholder state loaded through the preload API and no direct filesystem or Node access.

## Green
- [ ] Step 1.8: [automated] Add regression coverage for the foundation: Vitest tests for schema validation/redaction/storage wrappers where possible, an Electron main-process smoke test for window/tray action routing, and a renderer smoke test proving placeholder windows mount without secret/Node access.
- [ ] Step 1.9: [automated] Run Phase 1 verification: `npm run typecheck`, `npm test`, `npm run build`, and an Electron dev launch smoke command from `electron-app/`.

## Milestone
- [ ] `electron-app/` exists and starts locally.
- [ ] Main/preload/renderer boundaries are in place and secure by default.
- [ ] Renderer windows mount through React and only use the typed preload API.
- [ ] SQLite and secret-storage abstractions exist, with Linux weak-backend warning plumbing.
- [ ] Tray, popover, settings, onboarding, and overlay window shells exist.
- [ ] All phase tests pass.
- [ ] No regressions.

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
