# Phase 1: Electron Runtime Foundation

> Project: ClaudeUsage Electron cross-platform app
> Source: `specs/electron-cross-platform-ai-usage-monitor.md`
> Scope: Create the secure Electron/React runtime foundation for the Windows/Linux implementation while keeping Swift as the premium macOS app.
> Test strategy: tests-after

## Implementation
- [x] Step 1.1: [automated] Scaffold `electron-app/` with Electron, React, TypeScript, Vite, Electron Builder, Vitest, and project scripts in `electron-app/package.json`, `electron-app/vite.config.ts`, `electron-app/electron-builder.yml`, `electron-app/tsconfig*.json`, and `electron-app/src/`.
- [x] Step 1.2: [automated] Add the initial folder/module structure from the spec: `electron-app/src/main/`, `electron-app/src/preload/`, `electron-app/src/renderer/`, and `electron-app/src/shared/`, including shared type/schema placeholders for accounts, usage state, provider cards, settings, and IPC payloads.
- [x] Step 1.3: [automated] Implement the secure Electron main-process bootstrap in `electron-app/src/main/app.ts`, `electron-app/src/main/windows.ts`, and `electron-app/src/main/tray.ts`: single-instance lock, app lifecycle, tray creation, context menu skeleton, popover/settings/overlay/onboarding windows, CSP-ready local loading, and Linux tray fallback handling.
- [ ] Step 1.4: [automated] Add a narrow preload bridge in `electron-app/src/preload/index.ts` and `electron-app/src/preload/api.ts` using `contextBridge`, with Node integration disabled and context isolation/sandbox options set on all renderer windows.
- [ ] Step 1.5: [automated] Add IPC registration and validation skeletons in `electron-app/src/main/ipc.ts` plus shared schemas under `electron-app/src/shared/schemas/` for the commands listed in the spec.
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
